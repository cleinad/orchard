import {
  pdfQuadToViewportRect,
  viewportRectToPdfQuad,
} from "@/lib/pdf/pdfSelectionAnchor";
import type {
  PdfPageQuad,
  PdfViewportLike,
  PdfViewportRect,
} from "@/lib/pdf/types";

export const PDF_REGION_ANCHOR_VERSION = "pdf-region-v1" as const;

/**
 * A durable, page-space rectangle drawn in Highlight mode.
 *
 * `rect` is always in PDF page coordinates so a highlight survives zoom and
 * page rotation. CSS pixels are never the durable representation.
 */
export interface PdfRegionAnchor {
  version: typeof PDF_REGION_ANCHOR_VERSION;
  pageIndex: number;
  rect: PdfPageQuad;
}

export interface PdfRegionCrop {
  mimeType: "image/png";
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface PdfRegionPoint {
  x: number;
  y: number;
}

/** Drags shorter than this on either axis are treated as a mis-click. */
export const MIN_REGION_DRAG_PX = 10;

/** Crop render targets. The live drag outline never depends on these. */
export const REGION_CROP_TARGET_LONGEST_EDGE_PX = 1400;
export const REGION_CROP_MAX_PIXELS = 4_000_000;
export const REGION_CROP_MIN_SCALE = 0.25;
export const REGION_CROP_MAX_SCALE = 8;

export interface RegionCropScaleOptions {
  targetLongestEdgePx?: number;
  maxPixels?: number;
  minScale?: number;
  maxScale?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Builds a positive-area rect from two drag points, in any drag direction. */
export function normalizeDragRect(
  start: PdfRegionPoint,
  end: PdfRegionPoint
): PdfViewportRect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);

  return {
    left,
    top,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Keeps a drawn rect inside the rendered page surface. */
export function clampRectToBounds(
  rect: PdfViewportRect,
  bounds: { width: number; height: number }
): PdfViewportRect {
  const left = clamp(rect.left, 0, Math.max(0, bounds.width));
  const top = clamp(rect.top, 0, Math.max(0, bounds.height));
  const right = clamp(rect.left + rect.width, 0, Math.max(0, bounds.width));
  const bottom = clamp(rect.top + rect.height, 0, Math.max(0, bounds.height));

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function isRegionDragTooSmall(
  rect: PdfViewportRect,
  minimumPx = MIN_REGION_DRAG_PX
) {
  return rect.width < minimumPx || rect.height < minimumPx;
}

export interface CreatePdfRegionAnchorOptions {
  pageIndex: number;
  rect: PdfViewportRect;
  viewport: PdfViewportLike;
}

/**
 * Converts one on-screen drag rectangle into a page-space region anchor.
 * Returns `null` for degenerate rectangles rather than storing an empty quad.
 */
export function createPdfRegionAnchor({
  pageIndex,
  rect,
  viewport,
}: CreatePdfRegionAnchorOptions): PdfRegionAnchor | null {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
  if (!(rect.width > 0) || !(rect.height > 0)) return null;

  const quad = viewportRectToPdfQuad(rect, viewport);
  if (!(quad.x2 > quad.x1) || !(quad.y2 > quad.y1)) return null;

  return {
    version: PDF_REGION_ANCHOR_VERSION,
    pageIndex,
    rect: quad,
  };
}

/** Renders a stored region against any viewport (zoom and rotation aware). */
export function pdfRegionAnchorToViewportRect(
  anchor: PdfRegionAnchor,
  viewport: PdfViewportLike
): PdfViewportRect {
  return pdfQuadToViewportRect(anchor.rect, viewport);
}

/**
 * Picks an off-screen render scale that makes the crop's longest edge land near
 * the target, independent of the reader's current zoom, while respecting a hard
 * pixel budget.
 */
export function resolveRegionCropScale(
  region: { width: number; height: number },
  options: RegionCropScaleOptions = {}
) {
  const {
    targetLongestEdgePx = REGION_CROP_TARGET_LONGEST_EDGE_PX,
    maxPixels = REGION_CROP_MAX_PIXELS,
    minScale = REGION_CROP_MIN_SCALE,
    maxScale = REGION_CROP_MAX_SCALE,
  } = options;

  const longestEdge = Math.max(region.width, region.height);
  if (!(longestEdge > 0) || !(region.width > 0) || !(region.height > 0)) {
    return minScale;
  }

  let scale = clamp(targetLongestEdgePx / longestEdge, minScale, maxScale);

  const area = region.width * region.height;
  if (area * scale * scale > maxPixels) {
    scale = Math.max(minScale, Math.sqrt(maxPixels / area));
  }

  return scale;
}

export interface RegionCropPixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Snaps a scaled region to whole device pixels inside the rendered page,
 * guaranteeing at least a 1x1 canvas.
 */
export function resolveRegionCropPixelRect(
  rect: PdfViewportRect,
  bounds: { width: number; height: number }
): RegionCropPixelRect {
  const maxWidth = Math.max(1, Math.floor(bounds.width));
  const maxHeight = Math.max(1, Math.floor(bounds.height));
  const left = clamp(Math.floor(rect.left), 0, maxWidth - 1);
  const top = clamp(Math.floor(rect.top), 0, maxHeight - 1);
  const right = clamp(Math.ceil(rect.left + rect.width), left + 1, maxWidth);
  const bottom = clamp(Math.ceil(rect.top + rect.height), top + 1, maxHeight);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Generic accessible name for a region marker. A drawn rectangle has no
 * trustworthy text content, so the label never guesses at the region's meaning.
 */
export function formatRegionHighlightLabel(
  index: number,
  pageNumber: number,
  status: string
) {
  return `Highlight ${index} on page ${pageNumber} (${status})`;
}
