"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions";

type Options<O> = {
  successMessage?: string | ((data: O) => string);
  onSuccess?: (data: O) => void | Promise<void>;
  onError?: (error: { error: string; code: string; fieldErrors?: Record<string, string> }) => void;
  silent?: boolean;
};

/**
 * Runs a server action, shows success/error toasts and exposes pending state and field errors.
 * Every data-changing UI interaction goes through this so feedback is consistent.
 */
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>, options: Options<O> = {}) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    (input: I): Promise<ActionResult<O> | null> =>
      new Promise((resolve) => {
        startTransition(async () => {
          try {
            const result = await action(input);
            if (result.ok) {
              setFieldErrors({});
              if (!options.silent) {
                const msg = typeof options.successMessage === "function" ? options.successMessage(result.data) : options.successMessage;
                if (msg) toast.success(msg);
              }
              await options.onSuccess?.(result.data);
            } else {
              setFieldErrors(result.fieldErrors ?? {});
              if (!options.silent) {
                const warn = result.code === "validation" || result.code === "conflict";
                (warn ? toast.warning : toast.error)(result.error);
              }
              options.onError?.(result);
            }
            resolve(result);
          } catch {
            toast.error("Something went wrong. Please try again.");
            resolve(null);
          }
        });
      }),
    [action, options],
  );

  return { run, pending, fieldErrors, clearFieldErrors: () => setFieldErrors({}) };
}
