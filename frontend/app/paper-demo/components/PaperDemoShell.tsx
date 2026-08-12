"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { SelectionPopover } from "@/app/home/components/TextSelectionPopover";
import PaperThreadPanel, {
  PAPER_THREAD_PANEL_DEFAULT_WIDTH_PX,
} from "@/app/paper-demo/components/PaperThreadPanel";
import PdfPageView, {
  type PdfRegionDrawEvent,
} from "@/app/paper-demo/components/PdfPageView";
import type {
  DocumentRegionSelection,
  DocumentThreadSession,
  PreparedDocumentRef,
} from "@/app/paper-demo/documentThreadTypes";
import { createPdfDocumentId } from "@/lib/pdf/documentIdentity";
import { openPdfDocument } from "@/lib/pdf/pdfjsClient";
import { renderPdfRegionCrop } from "@/lib/pdf/pdfRegionCrop";
import type { PdfRegionAnchor } from "@/lib/pdf/pdfRegionAnchor";

/**
 * Lowered from 50 MB for this spike: the whole PDF is base64-inlined into one
 * provider request, and Anthropic caps a request at 32 MB total.
 */
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_FILE_LABEL = "16 MB";
const MAX_PAGES = 250;
const MIN_SCALE = 0.65;
const MAX_SCALE = 2.25;
const SCALE_STEP = 0.15;
const EXPLAIN_QUESTION = "Explain this region using the rest of the document.";

function PaperIcon({
  children,
  size = 16,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const UploadIcon = () => (
  <PaperIcon><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" /></PaperIcon>
);
const HighlightIcon = () => (
  <PaperIcon><path d="m15 4 5 5L9 20H4v-5L15 4Z" /><path d="m13 6 5 5M4 20h16" /></PaperIcon>
);
const FileIcon = () => (
  <PaperIcon size={30}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></PaperIcon>
);

interface LoadedPaper {
  id: string;
  name: string;
  file: File;
  document: PDFDocumentProxy;
  pageCount: number;
}

function normalizeScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function PaperDemoShell() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const currentDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const pendingLoadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const loadRequestIdRef = useRef(0);
  const paperRef = useRef<LoadedPaper | null>(null);
  const cropUrlsRef = useRef<Set<string>>(new Set());
  const preparedRef = useRef<(PreparedDocumentRef & { documentId: string }) | null>(
    null
  );
  const sessionCounterRef = useRef(0);
  const [paper, setPaper] = useState<LoadedPaper | null>(null);
  const [scale, setScale] = useState(1.15);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<PdfRegionAnchor | null>(null);
  const [selection, setSelection] = useState<DocumentRegionSelection | null>(null);
  const [sessions, setSessions] = useState<DocumentThreadSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(
    PAPER_THREAD_PANEL_DEFAULT_WIDTH_PX
  );
  const [regionNotice, setRegionNotice] = useState<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  // Keeps the loaded paper reachable from async callbacks without re-creating them.
  useEffect(() => {
    paperRef.current = paper;
  }, [paper]);

  const trackCropUrl = useCallback((bytes: Uint8Array, mimeType: string) => {
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mimeType })
    );
    cropUrlsRef.current.add(url);
    return url;
  }, []);

  const releaseCropUrl = useCallback((url: string) => {
    if (cropUrlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const releaseAllCropUrls = useCallback(() => {
    for (const url of cropUrlsRef.current) URL.revokeObjectURL(url);
    cropUrlsRef.current.clear();
  }, []);

  useEffect(
    () => () => {
      loadRequestIdRef.current += 1;
      for (const url of cropUrlsRef.current) URL.revokeObjectURL(url);
      cropUrlsRef.current.clear();
      void pendingLoadingTaskRef.current?.destroy();
      void currentDocumentRef.current?.loadingTask.destroy();
    },
    []
  );

  const dismissSelection = useCallback(() => {
    setSelection((current) => {
      if (current) releaseCropUrl(current.previewImageUrl);
      return null;
    });
    setActiveAnchor(null);
  }, [releaseCropUrl]);

  // Escape cancels an in-progress draw and leaves Highlight mode.
  useEffect(() => {
    if (!isHighlightMode) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsHighlightMode(false);
      setRegionNotice(null);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isHighlightMode]);

  const openFilePicker = () => fileInputRef.current?.click();

  const loadPdf = useCallback(
    async (file: File) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const pendingTask = pendingLoadingTaskRef.current;
      pendingLoadingTaskRef.current = null;
      if (pendingTask) void pendingTask.destroy();
      setLoadError(null);
      setRegionNotice(null);
      setIsLoading(true);
      if (file.size > MAX_FILE_BYTES) {
        setLoadError(`Choose a PDF smaller than ${MAX_FILE_LABEL}.`);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setLoadError("Choose a PDF file.");
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      let loadingTask: PDFDocumentLoadingTask | null = null;
      try {
        const bytes = await file.arrayBuffer();
        if (requestId !== loadRequestIdRef.current) return;
        const signature = new TextDecoder().decode(bytes.slice(0, 5));
        if (signature !== "%PDF-") {
          throw new Error("This file does not have a valid PDF signature.");
        }

        const documentId = await createPdfDocumentId(new Uint8Array(bytes));
        loadingTask = await openPdfDocument(new Uint8Array(bytes));
        pendingLoadingTaskRef.current = loadingTask;
        const nextDocument = await loadingTask.promise;
        if (pendingLoadingTaskRef.current === loadingTask) {
          pendingLoadingTaskRef.current = null;
        }
        if (requestId !== loadRequestIdRef.current) {
          await nextDocument.loadingTask.destroy();
          return;
        }
        if (nextDocument.numPages > MAX_PAGES) {
          await nextDocument.loadingTask.destroy();
          throw new Error(`This demo supports PDFs with up to ${MAX_PAGES} pages.`);
        }

        await currentDocumentRef.current?.loadingTask.destroy();
        if (requestId !== loadRequestIdRef.current) {
          await nextDocument.loadingTask.destroy();
          return;
        }
        currentDocumentRef.current = nextDocument;
        releaseAllCropUrls();
        preparedRef.current = null;
        sessionCounterRef.current = 0;
        setPaper({
          id: documentId,
          name: file.name,
          file,
          document: nextDocument,
          pageCount: nextDocument.numPages,
        });
        setSessions([]);
        setActiveSessionId(null);
        setSelection(null);
        setActiveAnchor(null);
        setIsHighlightMode(false);
        setIsPanelOpen(false);
        setScale(1.15);
      } catch (error) {
        if (loadingTask && pendingLoadingTaskRef.current === loadingTask) {
          pendingLoadingTaskRef.current = null;
          try {
            await loadingTask.destroy();
          } catch {
            // The original loading error is the actionable one.
          }
        }
        if (requestId !== loadRequestIdRef.current) return;
        const detail = error instanceof Error ? error.message : "";
        setLoadError(
          /password/i.test(detail)
            ? "Password-protected PDFs are not supported in this demo."
            : detail || "This PDF could not be opened."
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }
    },
    [releaseAllCropUrls]
  );

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadPdf(file);
  };

  const handleRegionDrawn = useCallback(
    async (event: PdfRegionDrawEvent) => {
      const reader = readerRef.current;
      const currentPaper = paperRef.current;
      if (!reader || !currentPaper) return;

      // Highlight mode is single-shot.
      setIsHighlightMode(false);
      setRegionNotice(null);
      dismissSelection();
      setActiveAnchor(event.anchor);

      const readerBounds = reader.getBoundingClientRect();
      const surfaceBounds = event.pageSurface.getBoundingClientRect();
      const anchorRect = {
        left:
          surfaceBounds.left - readerBounds.left + reader.scrollLeft + event.rect.left,
        top:
          surfaceBounds.top - readerBounds.top + reader.scrollTop + event.rect.top,
        width: event.rect.width,
        height: event.rect.height,
      };

      try {
        const crop = await renderPdfRegionCrop(
          currentPaper.document,
          event.anchor
        );
        if (paperRef.current !== currentPaper) return;
        setSelection({
          anchorRect,
          previewImageUrl: trackCropUrl(crop.bytes, crop.mimeType),
          previewImageAlt: `Highlighted region on page ${event.pageIndex + 1}`,
          documentId: currentPaper.id,
          documentName: currentPaper.name,
          anchor: event.anchor,
          crop,
        });
      } catch (error) {
        console.error("Failed to capture the region crop.", error);
        setActiveAnchor(null);
        setRegionNotice("That region could not be captured. Draw it again.");
      }
    },
    [dismissSelection, trackCropUrl]
  );

  const askDocumentThread = useCallback(
    async (session: DocumentThreadSession) => {
      const currentPaper = paperRef.current;
      if (!currentPaper) return;

      const buildBody = (forcePdf: boolean) => {
        const form = new FormData();
        form.set("documentId", session.documentId);
        form.set("documentName", session.documentName);
        form.set("pageIndex", String(session.anchor.pageIndex));
        form.set("question", session.question);
        form.set(
          "crop",
          new Blob([session.crop.bytes as BlobPart], {
            type: session.crop.mimeType,
          }),
          "region.png"
        );
        const prepared = preparedRef.current;
        const canReuse =
          !forcePdf
          && prepared
          && prepared.documentId === session.documentId
          && prepared.expiresAt > Date.now();
        if (canReuse && prepared) {
          form.set("documentToken", prepared.token);
        } else {
          // The full PDF only leaves the browser when a question is submitted.
          form.set("pdf", currentPaper.file, currentPaper.name);
        }
        return form;
      };

      const post = (forcePdf: boolean) =>
        fetch("/api/document-thread", {
          method: "POST",
          body: buildBody(forcePdf),
        });

      try {
        let response = await post(false);
        if (response.status === 409) {
          // The prepared record expired or the server restarted.
          preparedRef.current = null;
          response = await post(true);
        }
        const data = (await response.json()) as {
          answer?: string;
          document?: PreparedDocumentRef;
          error?: string;
        };
        if (!response.ok || !data.answer) {
          throw new Error(
            data.error || "This region question could not be answered."
          );
        }
        if (data.document) {
          preparedRef.current = {
            ...data.document,
            documentId: session.documentId,
          };
        }
        setSessions((current) =>
          current.map((candidate) =>
            candidate.id === session.id
              ? { ...candidate, status: "ready", answer: data.answer }
              : candidate
          )
        );
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : "This region question could not be answered.";
        setSessions((current) =>
          current.map((candidate) =>
            candidate.id === session.id
              ? { ...candidate, status: "error", answer: detail }
              : candidate
          )
        );
      }
    },
    []
  );

  const createThread = useCallback(
    (source: DocumentRegionSelection, question: string) => {
      const id = crypto.randomUUID();
      sessionCounterRef.current += 1;
      const nextSession: DocumentThreadSession = {
        id,
        index: sessionCounterRef.current,
        documentId: source.documentId,
        documentName: source.documentName,
        anchor: source.anchor,
        crop: source.crop,
        // The session takes ownership of the popover preview URL.
        cropUrl: source.previewImageUrl,
        status: "loading",
        question,
      };
      setSessions((current) => [...current, nextSession]);
      setActiveSessionId(id);
      setIsPanelOpen(true);
      setSelection(null);
      setActiveAnchor(null);
      void askDocumentThread(nextSession);
    },
    [askDocumentThread]
  );

  const showOnPage = (session: DocumentThreadSession) => {
    document
      .querySelector(`[data-pdf-page-index="${session.anchor.pageIndex}"]`)
      ?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
  };

  const activateThread = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsPanelOpen(true);
    dismissSelection();
  };

  return (
    <main className="paper-demo-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFile}
        className="sr-only"
        data-testid="paper-file-input"
      />
      <header className="paper-demo-toolbar">
        <div className="paper-demo-brand">
          <span className="paper-demo-brand-mark">
            <HighlightIcon />
          </span>
          <div>
            <p className="paper-kicker">Orchard reader</p>
            <h1>{paper?.name ?? "Paper threads"}</h1>
          </div>
        </div>
        <div className="paper-demo-toolbar-actions">
          {paper ? (
            <div className="paper-zoom-controls" aria-label="PDF zoom controls">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setScale((current) => normalizeScale(current - SCALE_STEP))}
                disabled={scale <= MIN_SCALE}
              >
                <PaperIcon size={15}><path d="M5 12h14" /></PaperIcon>
              </button>
              <output aria-live="polite">{Math.round(scale * 100)}%</output>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setScale((current) => normalizeScale(current + SCALE_STEP))}
                disabled={scale >= MAX_SCALE}
              >
                <PaperIcon size={15}><path d="M12 5v14M5 12h14" /></PaperIcon>
              </button>
            </div>
          ) : null}
          {paper ? (
            <button
              type="button"
              className="paper-toolbar-button"
              data-testid="paper-highlight-toggle"
              aria-pressed={isHighlightMode}
              onClick={() => {
                setIsHighlightMode((current) => !current);
                setRegionNotice(null);
              }}
            >
              <HighlightIcon />
              Highlight
            </button>
          ) : null}
          {activeSession && !isPanelOpen ? (
            <button
              type="button"
              className="paper-toolbar-button"
              onClick={() => setIsPanelOpen(true)}
            >
              <PaperIcon size={15}><path d="M4 4h16v16H4zM14 4v16M17 9l-3 3 3 3" /></PaperIcon>
              Open thread
            </button>
          ) : null}
          <button type="button" className="paper-toolbar-button" onClick={openFilePicker}>
            <UploadIcon />
            {paper ? "Replace PDF" : "Open PDF"}
          </button>
        </div>
      </header>

      <div
        className="paper-demo-workspace"
        data-highlight-mode={isHighlightMode ? "on" : "off"}
      >
        <section
          ref={readerRef}
          className="paper-reader-scroll"
          aria-label="PDF reader"
          style={
            isPanelOpen
              ? ({ "--paper-panel-space": `${panelWidth}px` } as React.CSSProperties)
              : undefined
          }
        >
          {!paper ? (
            <div className="paper-empty-state">
              <div className="paper-empty-icon">
                <FileIcon />
              </div>
              <p className="paper-kicker">Local PDF prototype</p>
              <h2>Read with the conversation attached.</h2>
              <p>
                Open a PDF, turn on Highlight mode, and draw a box around any
                region — prose, a figure, a table, or a scanned page. The file
                stays in this browser until you ask your first question, when it
                is sent once so the answer can use the whole document.
              </p>
              <button type="button" onClick={openFilePicker}>
                <UploadIcon />
                Choose a PDF
              </button>
              <small>PDF only · {MAX_FILE_LABEL} · up to {MAX_PAGES} pages</small>
              {isLoading ? <p role="status">Opening PDF…</p> : null}
              {loadError ? <p className="paper-error" role="alert">{loadError}</p> : null}
            </div>
          ) : (
            <div className="paper-pages">
              {Array.from({ length: paper.pageCount }, (_, pageIndex) => (
                <PdfPageView
                  key={pageIndex}
                  document={paper.document}
                  pageIndex={pageIndex}
                  scale={scale}
                  isHighlightMode={isHighlightMode}
                  activeAnchor={
                    activeAnchor?.pageIndex === pageIndex ? activeAnchor : null
                  }
                  sessions={sessions.filter(
                    (session) => session.anchor.pageIndex === pageIndex
                  )}
                  onRegionDrawn={handleRegionDrawn}
                  onActivateThread={activateThread}
                />
              ))}
            </div>
          )}
          {regionNotice ? (
            <div className="paper-selection-notice" role="status">
              {regionNotice}
            </div>
          ) : null}
          {paper && loadError ? (
            <div className="paper-selection-notice paper-selection-error" role="alert">
              {loadError}
            </div>
          ) : null}
          <SelectionPopover
            popoverState={selection}
            onDismiss={dismissSelection}
            onSubmitQuestion={(source, question) => createThread(source, question)}
            quickActionLabel="Explain"
            onQuickAction={(source) => createThread(source, EXPLAIN_QUESTION)}
          />
        </section>

        <PaperThreadPanel
          isOpen={isPanelOpen}
          widthPx={panelWidth}
          session={activeSession}
          onWidthChange={setPanelWidth}
          onShowOnPage={showOnPage}
          onClose={() => setIsPanelOpen(false)}
        />
      </div>
    </main>
  );
}
