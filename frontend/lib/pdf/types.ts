export const PDF_TEXT_STREAM_VERSION = "pdfjs-page-text-v1" as const;

export interface PdfTextItemLike {
  str: string;
  hasEOL?: boolean;
}

export interface PdfTextSegment {
  itemIndex: number;
  text: string;
  start: number;
  end: number;
  hasEOL: boolean;
}

export interface PdfTextStream {
  version: typeof PDF_TEXT_STREAM_VERSION;
  text: string;
  segments: PdfTextSegment[];
}

export interface PdfPageQuad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfTextAnchor {
  version: typeof PDF_TEXT_STREAM_VERSION;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
  exact: string;
  prefix: string;
  suffix: string;
  quads: PdfPageQuad[];
}

export interface PdfViewportLike {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

export interface PdfViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

