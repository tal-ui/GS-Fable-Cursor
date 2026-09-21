import "server-only";
import { z } from "zod";
import { requirePermission, type Permission } from "@/lib/auth/authorize";
import type { CurrentUser } from "@/lib/auth/session";
import { isAppError, userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string> };

type Handler<I, O> = (input: I, user: CurrentUser) => Promise<O>;

/**
 * Wraps a server action with authentication, permission enforcement, input validation and
 * friendly error handling. Every mutation in the app goes through this boundary, so the API
 * layer independently verifies the caller regardless of what the UI shows.
 */
export function defineAction<S extends z.ZodTypeAny, O>(
  options: { permission: Permission; resource?: string; schema: S },
  handler: Handler<z.output<S>, O>,
): (input: z.input<S>) => Promise<ActionResult<O>> {
  return async (rawInput) => {
    try {
      const user = await requirePermission(options.permission, options.resource);
      const parsed = options.schema.safeParse(rawInput);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        return { ok: false, code: "validation", error: "Please correct the highlighted fields.", fieldErrors };
      }
      const data = await handler(parsed.data, user);
      return { ok: true, data };
    } catch (error) {
      if (isAppError(error)) {
        if (error.code === "internal" || error.code === "integration") {
          logger.error("action.failed", { resource: options.resource, code: error.code, error: error.message });
        }
        return { ok: false, code: error.code, error: error.message, fieldErrors: error.details };
      }
      logger.error("action.unhandled", { resource: options.resource, error: String(error) });
      return { ok: false, code: "internal", error: userFacingMessage(error) };
    }
  };
}
