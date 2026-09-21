import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase() || "?";
}

const FALLBACK_TIMEZONE = "Asia/Jerusalem";

function resolveTimeZone(candidate: string | undefined): string {
  const tz = candidate?.trim() || FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Every timestamp is shown in one business time zone rather than whichever zone the server or the
 * browser happens to run in, so server-rendered and hydrated markup agree and two colleagues never
 * read different times for the same interview.
 */
export const APP_TIMEZONE = resolveTimeZone(process.env.NEXT_PUBLIC_APP_TIMEZONE);

const wallClockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(d: Date): WallClock {
  const p: Record<string, number> = {};
  for (const part of wallClockFormat.formatToParts(d)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour! === 24 ? 0 : p.hour!, minute: p.minute!, second: p.second! };
}

/** Shifts an instant so date-fns' local-time formatters print APP_TIMEZONE wall-clock time. */
function inAppTimeZone(d: Date): Date {
  const w = wallClock(d);
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, d.getMilliseconds());
}

function appOffsetMs(at: number): number {
  const w = wallClock(new Date(at));
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - at;
}

/**
 * Interprets a `datetime-local` value ("2026-09-22T10:00") as APP_TIMEZONE wall-clock time.
 * Strings that already carry an offset or Z are taken as-is.
 */
export function parseAppDateTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input.trim());
  if (!m) {
    const d = new Date(input);
    return isValid(d) ? d : null;
  }
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  // The offset in force at the guessed instant may differ from the one at the answer around a DST switch.
  const firstOffset = appOffsetMs(guess);
  const secondOffset = appOffsetMs(guess - firstOffset);
  const d = new Date(guess - secondOffset);
  return isValid(d) ? d : null;
}

type Parsed = { date: Date; calendarOnly: boolean };

/** Date-only columns arrive as "YYYY-MM-DD" and have no zone; instants are zoned before formatting. */
function toDate(value: Date | string | null | undefined): Parsed | null {
  if (!value) return null;
  const calendarOnly = typeof value === "string" && value.length === 10;
  const d = typeof value === "string" ? (calendarOnly ? parseISO(value) : new Date(value)) : value;
  return isValid(d) ? { date: d, calendarOnly } : null;
}

function zoned(p: Parsed): Date {
  return p.calendarOnly ? p.date : inAppTimeZone(p.date);
}

export function fmtDate(value: Date | string | null | undefined, pattern = "d MMM yyyy"): string {
  const p = toDate(value);
  return p ? format(zoned(p), pattern) : "—";
}

export function fmtDateTime(value: Date | string | null | undefined): string {
  const p = toDate(value);
  return p ? format(zoned(p), "d MMM yyyy, HH:mm") : "—";
}

/**
 * Minute granularity at the fine end: showing seconds guarantees a hydration mismatch, because the
 * server and the browser render a few hundred milliseconds apart.
 */
export function fmtRelative(value: Date | string | null | undefined): string {
  const p = toDate(value);
  if (!p) return "—";
  const diff = p.date.getTime() - Date.now();
  if (Math.abs(diff) < 60_000) return diff < 0 ? "just now" : "in under a minute";
  const text = formatDistanceToNowStrict(p.date, { addSuffix: false });
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

export function fmtMoney(amount: number | string | null | undefined, currency = "USD", period?: string | null): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  let text: string;
  try {
    text = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    text = `${currency} ${n.toLocaleString("en-US")}`;
  }
  return period ? `${text} / ${PERIOD_SHORT[period] ?? period}` : text;
}

const PERIOD_SHORT: Record<string, string> = { hourly: "hr", daily: "day", weekly: "wk", monthly: "mo", annual: "yr" };

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtPercent(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(" ") || "—";
}

export function toDateInput(value: Date | string | null | undefined): string {
  const p = toDate(value);
  return p ? format(zoned(p), "yyyy-MM-dd") : "";
}

export function toDateTimeInput(value: Date | string | null | undefined): string {
  const p = toDate(value);
  return p ? format(zoned(p), "yyyy-MM-dd'T'HH:mm") : "";
}

export function truncate(text: string | null | undefined, max = 80): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.toLowerCase()) ?? code;
  } catch {
    return code;
  }
}
