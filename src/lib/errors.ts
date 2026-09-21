export type AppErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "integration"
  | "rate_limited"
  | "internal";

const STATUS: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  integration: 502,
  rate_limited: 429,
  internal: 500,
};

/**
 * Error type that is safe to surface to users. `message` is always human-readable;
 * `details` carries field-level information for forms.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what = "Record") => new AppError("not_found", `${what} was not found or you do not have access to it.`);
export const forbiddenError = () => new AppError("forbidden", "You do not have permission to perform this action.");
export const unauthorizedError = () => new AppError("unauthorized", "Please sign in to continue.");
export const conflict = (message: string) => new AppError("conflict", message);
export const validation = (message: string, details?: Record<string, string>) => new AppError("validation", message, details);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Message safe to show in a toast: never leaks internals. */
export function userFacingMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  return "Something went wrong on our side. The problem has been logged; please try again.";
}
