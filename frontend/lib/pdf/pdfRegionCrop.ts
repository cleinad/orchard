"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import {
  pdfRegionAnchorToViewportRect,
  resolveRegionCropPixelRect,
  resolveRegionCropScale,
  type PdfRegionAnchor,
  type PdfRegionCrop,
  type RegionCropScaleOptions,
} from "@/lib/pdf/pdfRegionAnchor";

export class PdfRegionCropError extends Error {}

function canvasToPngBytes(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new PdfRegionCropError("The region crop could not be encoded."));
        return;
      }
      blob
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, "image/png");
  });
}

/**
 * Re-renders the source page off-screen at a bounded, zoom-independent scale and
 * returns just the anchored region as PNG bytes.
 *
 * The reader's on-screen canvas is never reused, so a region drawn while zoomed
 * out is still legible. Page rotation is handled by PDF.js's own viewport.
 */
export async function renderPdfRegionCrop(
  document: PDFDocumentProxy,
  anchor: PdfRegionAnchor,
  options: RegionCropScaleOptions & { signal?: AbortSignal } = {}
): Promise<PdfRegionCrop> {
  const { signal, ...scaleOptions } = options;
  let page: PDFPageProxy | null = null;
  let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;
  let canvas: HTMLCanvasElement | null = null;

  const abort = () => renderTask?.cancel();
  signal?.addEventListener("abort", abort);

  try {
    page = await document.getPage(anchor.pageIndex + 1);
    signal?.throwIfAborted();

    const baseViewport = page.getViewport({ scale: 1 });
    const baseRect = pdfRegionAnchorToViewportRect(anchor, baseViewport);
    const scale = resolveRegionCropScale(baseRect, scaleOptions);

    const viewport = page.getViewport({ scale });
    const scaledRect = pdfRegionAnchorToViewportRect(anchor, viewport);
    const cropRect = resolveRegionCropPixelRect(scaledRect, viewport);

    canvas = window.document.createElement("canvas");
    canvas.width = cropRect.width;
    canvas.height = cropRect.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new PdfRegionCropError("Canvas rendering is unavailable.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cropRect.width, cropRect.height);

    renderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      // Shift the full-page render so the region lands at the canvas origin.
      transform: [1, 0, 0, 1, -cropRect.left, -cropRect.top],
    });
    await renderTask.promise;
    signal?.throwIfAborted();

    const bytes = await canvasToPngBytes(canvas);
    signal?.throwIfAborted();

    return {
      mimeType: "image/png",
      bytes,
      width: cropRect.width,
      height: cropRect.height,
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    renderTask?.cancel();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    page?.cleanup();
  }
}
