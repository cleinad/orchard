import {
  PDF_TEXT_STREAM_VERSION,
  type PdfTextItemLike,
  type PdfTextStream,
} from "@/lib/pdf/types";

export function buildPdfTextStream(items: PdfTextItemLike[]): PdfTextStream {
  let text = "";
  const segments = items.map((item, itemIndex) => {
    const start = text.length;
    text += item.str;
    const end = text.length;
    const hasEOL = Boolean(item.hasEOL);

    if (hasEOL && !text.endsWith("\n")) {
      text += "\n";
    }

    return {
      itemIndex,
      text: item.str,
      start,
      end,
      hasEOL,
    };
  });

  return {
    version: PDF_TEXT_STREAM_VERSION,
    text,
    segments,
  };
}

export function normalizePdfSelectionText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validatePdfSelectionText(nativeText: string, canonicalText: string) {
  const normalizedNativeText = normalizePdfSelectionText(nativeText);
  const normalizedCanonicalText = normalizePdfSelectionText(canonicalText);

  return Boolean(
    normalizedNativeText
    && normalizedCanonicalText
    && normalizedNativeText === normalizedCanonicalText
  );
}

export function getPdfSelectionQuote(
  stream: PdfTextStream,
  startOffset: number,
  endOffset: number,
  contextLength = 32
) {
  const start = Math.max(0, Math.min(startOffset, stream.text.length));
  const end = Math.max(start, Math.min(endOffset, stream.text.length));

  return {
    exact: stream.text.slice(start, end),
    prefix: stream.text.slice(Math.max(0, start - contextLength), start),
    suffix: stream.text.slice(end, Math.min(stream.text.length, end + contextLength)),
  };
}

