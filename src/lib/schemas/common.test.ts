import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalNumber, optionalText, optionalUuid } from "./common";

describe("optionalNumber", () => {
  it("normalises empty form values to null instead of zero", () => {
    expect(optionalNumber.parse("")).toBeNull();
    expect(optionalNumber.parse(null)).toBeNull();
    expect(optionalNumber.parse(undefined)).toBeNull();
    expect(z.object({ n: optionalNumber }).parse({})).toEqual({ n: null });
  });

  it("coerces numeric strings and keeps real zeros", () => {
    expect(optionalNumber.parse("12")).toBe(12);
    expect(optionalNumber.parse(" 3.5 ")).toBe(3.5);
    expect(optionalNumber.parse(0)).toBe(0);
    expect(optionalNumber.parse("0")).toBe(0);
  });

  it("rejects non-numeric input rather than silently dropping it", () => {
    expect(optionalNumber.safeParse("abc").success).toBe(false);
  });
});

describe("optional text and uuid helpers", () => {
  it("turn empty strings into null", () => {
    expect(optionalText().parse("")).toBeNull();
    expect(optionalText().parse("  hi ")).toBe("hi");
    expect(optionalUuid.parse("")).toBeNull();
  });
});
