import type {
  PdfRegionAnchor,
  PdfRegionCrop,
} from "@/lib/pdf/pdfRegionAnchor";

export type DocumentThreadStatus = "loading" | "ready" | "error";

/**
 * Session-only state for one region thread. Deliberately has no
 * `highlightedText`, text offsets, or quote preview: the source of a region
 * thread is an image crop, not a passage.
 */
export interface DocumentThreadSession {
  id: string;
  /** 1-based creation order, used only for the generic highlight label. */
  index: number;
  documentId: string;
  documentName: string;
  anchor: PdfRegionAnchor;
  crop: PdfRegionCrop;
  /** Object URL for the crop, for display only. Revoked with the session. */
  cropUrl: string;
  status: DocumentThreadStatus;
  question: string;
  answer?: string;
}

/**
 * The popover source for a freshly drawn region, before a thread exists.
 * `anchorRect` is reader-scroll-space, as the shared popover expects.
 */
export interface DocumentRegionSelection {
  anchorRect: { left: number; top: number; width: number; height: number };
  previewImageUrl: string;
  previewImageAlt: string;
  documentId: string;
  documentName: string;
  anchor: PdfRegionAnchor;
  crop: PdfRegionCrop;
}

/** Server-issued handle for an expiring, in-memory prepared document. */
export interface PreparedDocumentRef {
  token: string;
  expiresAt: number;
}
