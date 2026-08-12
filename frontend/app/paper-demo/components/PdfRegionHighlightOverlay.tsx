"use client";

import { useMemo } from "react";
import type { DocumentThreadSession } from "@/app/paper-demo/documentThreadTypes";
import {
  formatRegionHighlightLabel,
  pdfRegionAnchorToViewportRect,
} from "@/lib/pdf/pdfRegionAnchor";
import type { PdfViewportLike, PdfViewportRect } from "@/lib/pdf/types";

interface PdfRegionHighlightOverlayProps {
  /** Live/active outline while the question popover is open. */
  activeRect: PdfViewportRect | null;
  sessions: DocumentThreadSession[];
  viewport: PdfViewportLike;
  onActivate: (sessionId: string) => void;
}

/**
 * Renders persisted regions as rounded outlines. Fills are deliberately avoided
 * so figures, tables, and equations under a highlight stay readable.
 */
export default function PdfRegionHighlightOverlay({
  activeRect,
  sessions,
  viewport,
  onActivate,
}: PdfRegionHighlightOverlayProps) {
  const regions = useMemo(
    () =>
      sessions.map((session) => ({
        id: session.id,
        status: session.status,
        rect: pdfRegionAnchorToViewportRect(session.anchor, viewport),
        label: formatRegionHighlightLabel(
          session.index,
          session.anchor.pageIndex + 1,
          session.status
        ),
      })),
    [sessions, viewport]
  );

  return (
    <div className="paper-highlight-layer">
      {regions.map(({ id, rect, label, status }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          data-testid="paper-region-highlight"
          data-paper-thread-id={id}
          data-region-status={status}
          onClick={() => onActivate(id)}
          className="paper-region-highlight"
          style={rect}
        />
      ))}
      {activeRect ? (
        <span
          data-testid="paper-region-active"
          className="paper-region-active"
          style={activeRect}
        />
      ) : null}
    </div>
  );
}
