import { describe, expect, it } from "vitest";
import {
  buildPdfTextStream,
  getPdfSelectionQuote,
  normalizePdfSelectionText,
  validatePdfSelectionText,
} from "@/lib/pdf/pdfTextStream";

describe("PDF canonical text stream", () => {
  it("is deterministic and preserves explicit line endings", () => {
    const items = [
      { str: "A precise passage", hasEOL: true },
      { str: "continues here.", hasEOL: false },
    ];

    expect(buildPdfTextStream(items)).toEqual(buildPdfTextStream(items));
    expect(buildPdfTextStream(items).text).toBe("A precise passage\ncontinues here.");
  });

  it("produces exact text with bounded context", () => {
    const stream = buildPdfTextStream([
      { str: "Before exact selection after", hasEOL: false },
    ]);
    const start = stream.text.indexOf("exact");

    expect(getPdfSelectionQuote(stream, start, start + 5, 7)).toEqual({
      exact: "exact",
      prefix: "Before ",
      suffix: " select",
    });
  });

  it("normalizes visible whitespace and compatibility ligatures for validation", () => {
    expect(normalizePdfSelectionText("  office\n  hours  ")).toBe("office hours");
    expect(validatePdfSelectionText("ofﬁce hours", "office\nhours")).toBe(true);
  });

  it("rejects mismatched or empty selections", () => {
    expect(validatePdfSelectionText("left column", "right column")).toBe(false);
    expect(validatePdfSelectionText(" ", "")).toBe(false);
  });
});

