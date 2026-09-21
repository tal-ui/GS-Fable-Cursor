type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = /token|secret|password|authorization|cookie|passport|id_number|ssn/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(data ? (redact(data) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Centralised structured logger. Keeps sensitive content out of routine logs. */
export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") write("debug", event, data);
  },
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
