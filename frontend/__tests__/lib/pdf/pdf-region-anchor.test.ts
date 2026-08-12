import { describe, expect, it } from "vitest";
import {
  MIN_REGION_DRAG_PX,
  clampRectToBounds,
  createPdfRegionAnchor,
  formatRegionHighlightLabel,
  isRegionDragTooSmall,
  normalizeDragRect,
  pdfRegionAnchorToViewportRect,
  resolveRegionCropPixelRect,
  resolveRegionCropScale,
} from "@/lib/pdf/pdfRegionAnchor";
import type { PdfViewportLike } from "@/lib/pdf/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function createViewport(scale: number, rotation = 0): PdfViewportLike {
  if (rotation === 90) {
    return {
      width: PAGE_HEIGHT * scale,
      height: PAGE_WIDTH * scale,
      rotation,
      convertToPdfPoint(x, y) {
        return [y / scale, PAGE_HEIGHT - x / scale];
      },
      convertToViewportPoint(x, y) {
        return [(PAGE_HEIGHT - y) * scale, x * scale];
      },
    };
  }

  return {
    width: PAGE_WIDTH * scale,
    height: PAGE_HEIGHT * scale,
    rotation,
    convertToPdfPoint(x, y) {
      return [x / scale, PAGE_HEIGHT - y / scale];
    },
    convertToViewportPoint(x, y) {
      return [x * scale, (PAGE_HEIGHT - y) * scale];
    },
  };
}

describe("region drag rectangles", () => {
  it.each([
    ["down-right", { x: 20, y: 30 }, { x: 120, y: 90 }],
    ["up-left", { x: 120, y: 90 }, { x: 20, y: 30 }],
    ["down-left", { x: 120, y: 30 }, { x: 20, y: 90 }],
    ["up-right", { x: 20, y: 90 }, { x: 120, y: 30 }],
  ])("normalizes a %s drag to the same rectangle", (_direction, start, end) => {
    expect(normalizeDragRect(start, end)).toEqual({
      left: 20,
      top: 30,
      width: 100,
      height: 60,
    });
  });

  it("clamps a drag that leaves the rendered page", () => {
    const clamped = clampRectToBounds(
      { left: -40, top: -25, width: 200, height: 150 },
      { width: 100, height: 100 }
    );

    expect(clamped).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("cancels drags under the mis-click threshold on either axis", () => {
    const long = MIN_REGION_DRAG_PX * 4;
    const short = MIN_REGION_DRAG_PX - 1;

    expect(
      isRegionDragTooSmall({ left: 0, top: 0, width: short, height: short })
    ).toBe(true);
    expect(
      isRegionDragTooSmall({ left: 0, top: 0, width: long, height: short })
    ).toBe(true);
    expect(
      isRegionDragTooSmall({ left: 0, top: 0, width: short, height: long })
    ).toBe(true);
    expect(
      isRegionDragTooSmall({
        left: 0,
        top: 0,
        width: MIN_REGION_DRAG_PX,
        height: MIN_REGION_DRAG_PX,
      })
    ).toBe(false);
  });
});

describe("region anchors", () => {
  it.each([0.65, 1, 1.15, 2.25])(
    "stores page coordinates that redraw identically at %sx zoom",
    (scale) => {
      const viewport = createViewport(scale);
      const rect = {
        left: 80 * scale,
        top: 140 * scale,
        width: 220 * scale,
        height: 96 * scale,
      };

      const anchor = createPdfRegionAnchor({ pageIndex: 2, rect, viewport });
      expect(anchor).not.toBeNull();
      expect(anchor?.version).toBe("pdf-region-v1");
      expect(anchor?.pageIndex).toBe(2);

      const restored = pdfRegionAnchorToViewportRect(anchor!, viewport);
      expect(restored.left).toBeCloseTo(rect.left, 2);
      expect(restored.top).toBeCloseTo(rect.top, 2);
      expect(restored.width).toBeCloseTo(rect.width, 2);
      expect(restored.height).toBeCloseTo(rect.height, 2);
    }
  );

  it("keeps one page-space rect aligned across zoom changes", () => {
    const drawViewport = createViewport(1);
    const anchor = createPdfRegionAnchor({
      pageIndex: 0,
      rect: { left: 100, top: 200, width: 150, height: 60 },
      viewport: drawViewport,
    });

    const zoomed = pdfRegionAnchorToViewportRect(anchor!, createViewport(2));
    expect(zoomed.left).toBeCloseTo(200, 2);
    expect(zoomed.top).toBeCloseTo(400, 2);
    expect(zoomed.width).toBeCloseTo(300, 2);
    expect(zoomed.height).toBeCloseTo(120, 2);
  });

  it("survives a rotated page viewport", () => {
    const viewport = createViewport(1.5, 90);
    const rect = { left: 120, top: 80, width: 180, height: 64 };
    const anchor = createPdfRegionAnchor({ pageIndex: 4, rect, viewport });
    const restored = pdfRegionAnchorToViewportRect(anchor!, viewport);

    expect(restored.left).toBeCloseTo(rect.left, 2);
    expect(restored.top).toBeCloseTo(rect.top, 2);
    expect(restored.width).toBeCloseTo(rect.width, 2);
    expect(restored.height).toBeCloseTo(rect.height, 2);
  });

  it("rejects degenerate rectangles and invalid pages", () => {
    const viewport = createViewport(1);
    const rect = { left: 10, top: 10, width: 40, height: 40 };

    expect(
      createPdfRegionAnchor({
        pageIndex: 0,
        rect: { left: 10, top: 10, width: 0, height: 40 },
        viewport,
      })
    ).toBeNull();
    expect(
      createPdfRegionAnchor({
        pageIndex: 0,
        rect: { left: 10, top: 10, width: 40, height: 0 },
        viewport,
      })
    ).toBeNull();
    expect(createPdfRegionAnchor({ pageIndex: -1, rect, viewport })).toBeNull();
    expect(createPdfRegionAnchor({ pageIndex: 1.5, rect, viewport })).toBeNull();
  });
});

describe("region crop resolution", () => {
  it("scales a small region up toward the target longest edge", () => {
    const scale = resolveRegionCropScale({ width: 400, height: 120 });
    expect(400 * scale).toBeCloseTo(1400, 5);
  });

  it("is independent of the reader's on-screen zoom", () => {
    const anchor = createPdfRegionAnchor({
      pageIndex: 0,
      rect: { left: 100, top: 100, width: 120, height: 40 },
      viewport: createViewport(1),
    })!;

    // The crop always measures the region against the unscaled page viewport,
    // so a region drawn while zoomed out renders at the same resolution.
    const drawnZoomedOut = pdfRegionAnchorToViewportRect(
      anchor,
      createViewport(1)
    );
    const anchorFromZoomedIn = createPdfRegionAnchor({
      pageIndex: 0,
      rect: { left: 200, top: 200, width: 240, height: 80 },
      viewport: createViewport(2),
    })!;
    const drawnZoomedIn = pdfRegionAnchorToViewportRect(
      anchorFromZoomedIn,
      createViewport(1)
    );

    expect(resolveRegionCropScale(drawnZoomedIn)).toBeCloseTo(
      resolveRegionCropScale(drawnZoomedOut),
      5
    );
  });

  it("never exceeds the maximum scale for a very small region", () => {
    const scale = resolveRegionCropScale({ width: 4, height: 4 });
    expect(scale).toBe(8);
  });

  it("respects the hard pixel budget for a large region", () => {
    const region = { width: 1200, height: 1600 };
    const scale = resolveRegionCropScale(region, { maxPixels: 1_000_000 });

    expect(region.width * scale * region.height * scale).toBeLessThanOrEqual(
      1_000_000 + 1
    );
  });

  it("falls back to the minimum scale for an empty region", () => {
    expect(resolveRegionCropScale({ width: 0, height: 0 })).toBe(0.25);
  });

  it("snaps the crop to whole pixels inside the page", () => {
    const rect = resolveRegionCropPixelRect(
      { left: 10.4, top: 20.6, width: 100.2, height: 50.9 },
      { width: 500, height: 500 }
    );

    expect(rect).toEqual({ left: 10, top: 20, width: 101, height: 52 });
    expect(Number.isInteger(rect.left)).toBe(true);
    expect(Number.isInteger(rect.width)).toBe(true);
  });

  it("clamps the crop to the page and keeps at least one pixel", () => {
    expect(
      resolveRegionCropPixelRect(
        { left: -20, top: -20, width: 900, height: 900 },
        { width: 300, height: 200 }
      )
    ).toEqual({ left: 0, top: 0, width: 300, height: 200 });

    const degenerate = resolveRegionCropPixelRect(
      { left: 50, top: 50, width: 0, height: 0 },
      { width: 300, height: 200 }
    );
    expect(degenerate.width).toBe(1);
    expect(degenerate.height).toBe(1);
  });
});

describe("region highlight labels", () => {
  it("uses a generic label that never guesses at region content", () => {
    expect(formatRegionHighlightLabel(2, 7, "ready")).toBe(
      "Highlight 2 on page 7 (ready)"
    );
  });
});
