"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  PageViewport,
  TextLayer,
} from "pdfjs-dist";
import PdfRegionHighlightOverlay from "@/app/paper-demo/components/PdfRegionHighlightOverlay";
import type { DocumentThreadSession } from "@/app/paper-demo/documentThreadTypes";
import {
  annotatePdfTextLayerItems,
} from "@/lib/pdf/pdfSelectionAnchor";
import {
  clampRectToBounds,
  createPdfRegionAnchor,
  isRegionDragTooSmall,
  normalizeDragRect,
  pdfRegionAnchorToViewportRect,
  type PdfRegionAnchor,
  type PdfRegionPoint,
} from "@/lib/pdf/pdfRegionAnchor";
import { loadPdfJs } from "@/lib/pdf/pdfjsClient";
import { buildPdfTextStream } from "@/lib/pdf/pdfTextStream";
import type { PdfViewportRect } from "@/lib/pdf/types";

export interface PdfRegionDrawEvent {
  pageIndex: number;
  anchor: PdfRegionAnchor;
  /** Region rect in page-surface CSS pixels, used to anchor the popover. */
  rect: PdfViewportRect;
  pageSurface: HTMLElement;
}

interface PdfPageViewProps {
  document: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  isHighlightMode: boolean;
  activeAnchor: PdfRegionAnchor | null;
  sessions: DocumentThreadSession[];
  onRegionDrawn: (event: PdfRegionDrawEvent) => void;
  onActivateThread: (sessionId: string) => void;
}

export default function PdfPageView({
  document,
  pageIndex,
  scale,
  isHighlightMode,
  activeAnchor,
  sessions,
  onRegionDrawn,
  onActivateThread,
}: PdfPageViewProps) {
  const wrapperRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<PdfRegionPoint | null>(null);
  const [isVisible, setIsVisible] = useState(pageIndex < 3);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [hasSelectableText, setHasSelectableText] = useState<boolean | null>(null);
  const [draftRect, setDraftRect] = useState<PdfViewportRect | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px 0px" }
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [isVisible]);

  // Leaving Highlight mode always drops any in-progress draw.
  useEffect(() => {
    if (!isHighlightMode) {
      dragStartRef.current = null;
      setDraftRect(null);
    }
  }, [isHighlightMode]);

  useEffect(() => {
    if (!isVisible) return;

    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let textLayer: TextLayer | null = null;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;
      const pageRoot = pageRootRef.current;
      const textLayerRoot = textLayerRef.current;
      if (!canvas || !pageRoot || !textLayerRoot) return;

      setRenderError(null);
      setHasSelectableText(null);
      setViewport(null);
      try {
        page = await document.getPage(pageIndex + 1);
        if (cancelled) return;

        const nextViewport = page.getViewport({ scale });
        setViewport(nextViewport);
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(nextViewport.width * outputScale);
        canvas.height = Math.floor(nextViewport.height * outputScale);
        canvas.style.width = `${nextViewport.width}px`;
        canvas.style.height = `${nextViewport.height}px`;
        pageRoot.style.width = `${nextViewport.width}px`;
        pageRoot.style.height = `${nextViewport.height}px`;
        pageRoot.style.setProperty("--total-scale-factor", String(scale));

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport: nextViewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });

        const textContent = await page.getTextContent();
        if (cancelled) return;
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        textLayerRoot.replaceChildren();
        textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerRoot,
          viewport: nextViewport,
        });

        await Promise.all([renderTask.promise, textLayer.render()]);
        if (cancelled) return;

        // The text layer stays interactive for native selection/copy where a
        // PDF has one. Region capture never depends on it.
        const stream = buildPdfTextStream(
          textContent.items.flatMap((item) =>
            "str" in item
              ? [{ str: item.str, hasEOL: item.hasEOL }]
              : []
          )
        );
        setHasSelectableText(Boolean(stream.text.trim()));
        annotatePdfTextLayerItems(textLayer.textDivs, stream);
      } catch (error) {
        if (!cancelled) {
          console.error(`Failed to render PDF page ${pageIndex + 1}.`, error);
          setRenderError("This page could not be rendered. Replace the PDF and try again.");
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [document, isVisible, pageIndex, scale]);

  const pointFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): PdfRegionPoint => {
      const bounds = event.currentTarget.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    },
    []
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!viewport || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = pointFromEvent(event);
    setDraftRect(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || !viewport) return;
    setDraftRect(
      clampRectToBounds(normalizeDragRect(start, pointFromEvent(event)), viewport)
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const pageSurface = pageRootRef.current;
    dragStartRef.current = null;
    setDraftRect(null);
    if (!start || !viewport || !pageSurface) return;

    const rect = clampRectToBounds(
      normalizeDragRect(start, pointFromEvent(event)),
      viewport
    );
    // A mis-click cancels silently rather than creating a tiny region.
    if (isRegionDragTooSmall(rect)) return;

    const anchor = createPdfRegionAnchor({ pageIndex, rect, viewport });
    if (!anchor) return;

    onRegionDrawn({ pageIndex, anchor, rect, pageSurface });
  };

  const handlePointerCancel = () => {
    dragStartRef.current = null;
    setDraftRect(null);
  };

  return (
    <article
      ref={wrapperRef}
      className="paper-page-frame"
      data-pdf-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1}`}
    >
      <p className="paper-page-number">Page {pageIndex + 1}</p>
      <div ref={pageRootRef} className="paper-pdf-page-surface">
        {renderError ? (
          <div className="paper-page-error" role="alert">
            {renderError}
          </div>
        ) : null}
        {hasSelectableText === false ? (
          <div className="paper-page-restriction" role="status">
            No selectable text on this page. Highlight mode still works here.
          </div>
        ) : null}
        <canvas ref={canvasRef} className="paper-page-canvas" />
        {viewport ? (
          <PdfRegionHighlightOverlay
            activeRect={
              activeAnchor
                ? pdfRegionAnchorToViewportRect(activeAnchor, viewport)
                : null
            }
            sessions={sessions}
            viewport={viewport}
            onActivate={onActivateThread}
          />
        ) : null}
        <div ref={textLayerRef} className="textLayer paper-text-layer" />
        {isHighlightMode && viewport ? (
          <div
            className="paper-region-capture-layer"
            data-testid={`paper-region-capture-${pageIndex}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {draftRect ? (
              <span
                className="paper-region-draft"
                data-testid="paper-region-draft"
                style={draftRect}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
