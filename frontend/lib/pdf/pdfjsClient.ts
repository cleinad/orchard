"use client";

import type { PDFDocumentLoadingTask } from "pdfjs-dist";

const PDFJS_ASSET_ROOT = "/pdfjs";

export const PDFJS_DOCUMENT_ASSET_OPTIONS = {
  cMapPacked: true,
  cMapUrl: `${PDFJS_ASSET_ROOT}/cmaps/`,
  standardFontDataUrl: `${PDFJS_ASSET_ROOT}/standard_fonts/`,
  wasmUrl: `${PDFJS_ASSET_ROOT}/wasm/`,
} as const;

let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function loadPdfJs() {
  pdfJsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    return pdfjs;
  });
  return pdfJsPromise;
}

export async function openPdfDocument(
  data: Uint8Array
): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data,
    ...PDFJS_DOCUMENT_ASSET_OPTIONS,
    stopAtErrors: false,
  });
}
