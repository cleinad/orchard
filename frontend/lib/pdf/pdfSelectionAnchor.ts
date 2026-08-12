import {
  PDF_TEXT_STREAM_VERSION,
  type PdfPageQuad,
  type PdfTextAnchor,
  type PdfTextStream,
  type PdfViewportLike,
  type PdfViewportRect,
} from "@/lib/pdf/types";
import {
  getPdfSelectionQuote,
  normalizePdfSelectionText,
  validatePdfSelectionText,
} from "@/lib/pdf/pdfTextStream";

const ITEM_INDEX_ATTRIBUTE = "data-pdf-text-item-index";
const MIN_RECT_SIZE = 0.5;
const EDGE_EPSILON = 0.25;

export interface ResolvePdfSelectionOptions {
  pageIndex: number;
  pageRoot: HTMLElement;
  range: Range;
  selectionText: string;
  stream: PdfTextStream;
  textLayerRoot: HTMLElement;
  viewport: PdfViewportLike;
}

export interface ResolvedPdfSelection {
  anchor: PdfTextAnchor;
  highlightedText: string;
  viewportRects: PdfViewportRect[];
}

function getItemElement(node: Node, textLayerRoot: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement;
  const itemElement = element?.closest<HTMLElement>(`[${ITEM_INDEX_ATTRIBUTE}]`) ?? null;
  return itemElement && textLayerRoot.contains(itemElement) ? itemElement : null;
}

function getItemIndex(element: HTMLElement) {
  const value = Number(element.getAttribute(ITEM_INDEX_ATTRIBUTE));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function getOffsetWithinItem(element: HTMLElement, node: Node, offset: number) {
  if (node === element) {
    const childOffset = Math.max(0, Math.min(offset, element.childNodes.length));
    let length = 0;
    for (let index = 0; index < childOffset; index += 1) {
      length += element.childNodes[index]?.textContent?.length ?? 0;
    }
    return length;
  }

  const ownerDocument = element.ownerDocument;
  const prefixRange = ownerDocument.createRange();
  prefixRange.selectNodeContents(element);

  try {
    prefixRange.setEnd(node, offset);
  } catch {
    prefixRange.detach();
    return null;
  }

  const length = prefixRange.toString().length;
  prefixRange.detach();
  return length;
}

function resolveBoundaryOffset(
  node: Node,
  offset: number,
  textLayerRoot: HTMLElement,
  stream: PdfTextStream
) {
  const itemElement = getItemElement(node, textLayerRoot);
  if (!itemElement) return null;

  const itemIndex = getItemIndex(itemElement);
  if (itemIndex === null) return null;

  const segment = stream.segments.find((candidate) => candidate.itemIndex === itemIndex);
  if (!segment) return null;

  const localOffset = getOffsetWithinItem(itemElement, node, offset);
  if (localOffset === null) return null;

  return segment.start + Math.max(0, Math.min(localOffset, segment.text.length));
}

function roundEdge(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sameQuad(a: PdfPageQuad, b: PdfPageQuad) {
  return (
    Math.abs(a.x1 - b.x1) <= EDGE_EPSILON
    && Math.abs(a.y1 - b.y1) <= EDGE_EPSILON
    && Math.abs(a.x2 - b.x2) <= EDGE_EPSILON
    && Math.abs(a.y2 - b.y2) <= EDGE_EPSILON
  );
}

export function viewportRectToPdfQuad(
  rect: PdfViewportRect,
  viewport: PdfViewportLike
): PdfPageQuad {
  const points = [
    viewport.convertToPdfPoint(rect.left, rect.top),
    viewport.convertToPdfPoint(rect.left + rect.width, rect.top),
    viewport.convertToPdfPoint(rect.left, rect.top + rect.height),
    viewport.convertToPdfPoint(rect.left + rect.width, rect.top + rect.height),
  ];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);

  return {
    x1: roundEdge(Math.min(...xs)),
    y1: roundEdge(Math.min(...ys)),
    x2: roundEdge(Math.max(...xs)),
    y2: roundEdge(Math.max(...ys)),
  };
}

export function pdfQuadToViewportRect(
  quad: PdfPageQuad,
  viewport: PdfViewportLike
): PdfViewportRect {
  const points = [
    viewport.convertToViewportPoint(quad.x1, quad.y1),
    viewport.convertToViewportPoint(quad.x2, quad.y1),
    viewport.convertToViewportPoint(quad.x1, quad.y2),
    viewport.convertToViewportPoint(quad.x2, quad.y2),
  ];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

export function capturePdfSelectionGeometry(
  range: Range,
  pageRoot: HTMLElement,
  viewport: PdfViewportLike
) {
  const pageBounds = pageRoot.getBoundingClientRect();
  const viewportRects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > MIN_RECT_SIZE && rect.height > MIN_RECT_SIZE)
    .map((rect) => ({
      left: rect.left - pageBounds.left,
      top: rect.top - pageBounds.top,
      width: rect.width,
      height: rect.height,
    }));
  const quads: PdfPageQuad[] = [];

  for (const rect of viewportRects) {
    const quad = viewportRectToPdfQuad(rect, viewport);
    if (!quads.some((candidate) => sameQuad(candidate, quad))) {
      quads.push(quad);
    }
  }

  return { quads, viewportRects };
}

export function resolvePdfSelection({
  pageIndex,
  pageRoot,
  range,
  selectionText,
  stream,
  textLayerRoot,
  viewport,
}: ResolvePdfSelectionOptions): ResolvedPdfSelection | null {
  if (
    !textLayerRoot.contains(range.startContainer)
    || !textLayerRoot.contains(range.endContainer)
  ) {
    return null;
  }

  const startOffset = resolveBoundaryOffset(
    range.startContainer,
    range.startOffset,
    textLayerRoot,
    stream
  );
  const endOffset = resolveBoundaryOffset(
    range.endContainer,
    range.endOffset,
    textLayerRoot,
    stream
  );

  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null;
  }

  const quote = getPdfSelectionQuote(stream, startOffset, endOffset);
  if (!validatePdfSelectionText(selectionText, quote.exact)) {
    return null;
  }

  const { quads, viewportRects } = capturePdfSelectionGeometry(range, pageRoot, viewport);
  if (quads.length === 0) {
    return null;
  }

  return {
    anchor: {
      version: PDF_TEXT_STREAM_VERSION,
      pageIndex,
      startOffset,
      endOffset,
      ...quote,
      quads,
    },
    highlightedText: normalizePdfSelectionText(quote.exact),
    viewportRects,
  };
}

export function annotatePdfTextLayerItems(
  textDivs: HTMLElement[],
  stream: PdfTextStream
) {
  for (const segment of stream.segments) {
    const element = textDivs[segment.itemIndex];
    if (element) {
      element.setAttribute(ITEM_INDEX_ATTRIBUTE, String(segment.itemIndex));
    }
  }
}

