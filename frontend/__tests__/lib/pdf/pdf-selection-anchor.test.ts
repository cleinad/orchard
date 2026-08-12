import { describe, expect, it } from "vitest";
import {
  pdfQuadToViewportRect,
  viewportRectToPdfQuad,
} from "@/lib/pdf/pdfSelectionAnchor";
import type { PdfViewportLike } from "@/lib/pdf/types";

function createViewport(scale: number, rotation = 0): PdfViewportLike {
  const width = 612;
  const height = 792;

  if (rotation === 90) {
    return {
      width: height * scale,
      height: width * scale,
      rotation,
      convertToPdfPoint(x, y) {
        return [y / scale, height - x / scale];
      },
      convertToViewportPoint(x, y) {
        return [(height - y) * scale, x * scale];
      },
    };
  }

  return {
    width: width * scale,
    height: height * scale,
    rotation,
    convertToPdfPoint(x, y) {
      return [x / scale, height - y / scale];
    },
    convertToViewportPoint(x, y) {
      return [x * scale, (height - y) * scale];
    },
  };
}

describe("PDF selection geometry", () => {
  it.each([0.75, 1, 1.5, 2])("round trips viewport geometry at %sx zoom", (scale) => {
    const viewport = createViewport(scale);
    const rect = {
      left: 84 * scale,
      top: 120 * scale,
      width: 210 * scale,
      height: 18 * scale,
    };

    const restored = pdfQuadToViewportRect(viewportRectToPdfQuad(rect, viewport), viewport);
    expect(restored.left).toBeCloseTo(rect.left, 3);
    expect(restored.top).toBeCloseTo(rect.top, 3);
    expect(restored.width).toBeCloseTo(rect.width, 3);
    expect(restored.height).toBeCloseTo(rect.height, 3);
  });

  it("round trips geometry through a rotated viewport", () => {
    const viewport = createViewport(1.5, 90);
    const rect = { left: 120, top: 80, width: 180, height: 20 };
    const restored = pdfQuadToViewportRect(viewportRectToPdfQuad(rect, viewport), viewport);

    expect(restored.left).toBeCloseTo(rect.left, 2);
    expect(restored.top).toBeCloseTo(rect.top, 2);
    expect(restored.width).toBeCloseTo(rect.width, 2);
    expect(restored.height).toBeCloseTo(rect.height, 2);
  });
});
