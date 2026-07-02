import { describe, expect, it } from "vitest";
import { formatSourceDate } from "@/lib/source-display";

describe("formatSourceDate", () => {
  it("formats ISO dates", () => {
    expect(formatSourceDate("2026-06-15T12:00:00.000Z")).toBe("Jun 15, 2026");
    expect(formatSourceDate("2026-06-15")).toBe("Jun 15, 2026");
  });

  it("keeps relative provider dates readable", () => {
    expect(formatSourceDate("2 days ago")).toBe("2 days ago");
    expect(formatSourceDate("today")).toBe("today");
  });

  it("omits non-date provider strings", () => {
    expect(formatSourceDate("not a date")).toBeNull();
    expect(formatSourceDate(null)).toBeNull();
    expect(formatSourceDate("")).toBeNull();
  });
});
