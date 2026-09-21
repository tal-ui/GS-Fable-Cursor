import { describe, expect, it } from "vitest";
import { APP_TIMEZONE, fmtDate, fmtDateTime, fmtRelative, parseAppDateTime, toDateInput, toDateTimeInput } from "./format";

// The suite runs with whatever TZ the machine has; every assertion below must hold regardless,
// which is exactly the property the app relies on to keep server and browser markup identical.
describe("business time zone formatting", () => {
  it("defaults to the Israel business zone", () => {
    expect(APP_TIMEZONE).toBe("Asia/Jerusalem");
  });

  it("prints instants as wall-clock time in the business zone", () => {
    // 07:30 UTC in mid-September is 10:30 in Israel (IDT, UTC+3).
    expect(fmtDateTime(new Date("2026-09-22T07:30:00.000Z"))).toBe("22 Sep 2026, 10:30");
    // 22:30 UTC on the 21st is already the 22nd locally, so the date rolls over.
    expect(fmtDate(new Date("2026-09-21T22:30:00.000Z"))).toBe("22 Sep 2026");
    // Standard time (UTC+2) in January.
    expect(fmtDateTime("2026-01-10T23:15:00.000Z")).toBe("11 Jan 2026, 01:15");
  });

  it("leaves calendar-only values untouched", () => {
    expect(fmtDate("2026-03-05")).toBe("5 Mar 2026");
    expect(toDateInput("2026-03-05")).toBe("2026-03-05");
  });

  it("round-trips datetime-local input through the business zone", () => {
    const typed = "2026-09-22T10:30";
    const instant = parseAppDateTime(typed);
    expect(instant?.toISOString()).toBe("2026-09-22T07:30:00.000Z");
    expect(toDateTimeInput(instant)).toBe(typed);

    // Winter: the same wall-clock time is one hour later in UTC.
    expect(parseAppDateTime("2026-01-11T01:15")?.toISOString()).toBe("2026-01-10T23:15:00.000Z");
    // Explicit offsets are honoured as written.
    expect(parseAppDateTime("2026-09-22T10:30:00Z")?.toISOString()).toBe("2026-09-22T10:30:00.000Z");
    expect(parseAppDateTime("not a date")).toBeNull();
    expect(parseAppDateTime("")).toBeNull();
  });

  it("never renders seconds in relative times", () => {
    expect(fmtRelative(new Date(Date.now() - 5_000))).toBe("just now");
    expect(fmtRelative(new Date(Date.now() + 20_000))).toBe("in under a minute");
    expect(fmtRelative(new Date(Date.now() - 5 * 60_000))).toBe("5 minutes ago");
    expect(fmtRelative(new Date(Date.now() + 3 * 86_400_000))).toBe("in 3 days");
    expect(fmtRelative(null)).toBe("—");
  });
});
