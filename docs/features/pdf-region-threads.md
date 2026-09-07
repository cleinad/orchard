# PDF Region Threads

- **Status:** Built and automated-tested on `/paper-demo`; manual evaluation gate not yet run
- **Supersedes:** `lean-pdf-spike.md` and `pdf-highlight-v1-decisions.md` (both removed; their durable content is captured here)

A user on protected, unlinked `/paper-demo` opens a local PDF, turns on Highlight mode, drags one rectangle over any page content including scanned pages, and asks a question. The answer is grounded in an image crop of that region plus the complete PDF. The highlight persists as a page-space border and reopens its thread.

Session-only. No database rows, object storage, IndexedDB, reload recovery, or PDF persistence.

---

## 1. What is in place

### Core decisions (durable)

**Rectangle capture, not text-offset anchoring.** The content people need explained — figures, diagrams, equations, tables, scans — has no faithful plain-text representation. A rectangle works identically on a born-digital single-column page, an untagged two-column layout, and an image-only scan, and sidesteps the entire text-readability-tier problem. Known tradeoff: no exact copyable text quote for a thread source. Revisit only if a citations or search-within-document feature needs precise quoting.

**Whole-document context, not selected-passage-only.** A crop in isolation loses the surrounding argument. Papers fit comfortably in modern context windows. RAG was rejected: right for book-length documents, pure overhead at paper length, and it would reintroduce the text-extraction-quality dependency the rectangle pivot removed.

**One pinned model, no switching.** `claude-sonnet-5`, pinned locally in `lib/document-threads/documentThreadModel.ts`. Deliberately **not** added to `lib/chat-models.ts`: the shared catalog's `supportsImages` flag is not evidence of document support, and adding it would surface the model in main chat.

### Contracts

```ts
interface PdfRegionAnchor {          // lib/pdf/pdfRegionAnchor.ts
  version: "pdf-region-v1";
  pageIndex: number;
  rect: PdfPageQuad;                 // always PDF page coordinates
}

interface PdfRegionCrop {
  mimeType: "image/png";
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface DocumentThreadSession {    // app/paper-demo/documentThreadTypes.ts
  id: string;
  index: number;                     // 1-based, for the "Highlight {n}" label
  documentId: string;                // SHA-256 of the PDF
  documentName: string;
  anchor: PdfRegionAnchor;
  crop: PdfRegionCrop;
  cropUrl: string;                   // object URL, display only
  status: "loading" | "ready" | "error";
  question: string;
  answer?: string;
}

interface PreparedDocumentRecord {   // lib/document-threads/preparedDocuments.ts
  userId, documentId, provider, modelId;   // identity, all four must match
  token: string;                     // server-issued, opaque
  documentName: string;
  bytes: Uint8Array;                 // the PDF itself
  expiresAt: number;                 // 20 min, sliding
}
```

Highlight geometry is stored in PDF page coordinates and rendered through `pdfQuadToViewportRect`, so it survives zoom and page rotation. CSS pixels are never durable.

### Behaviour

| Area | Implementation |
|---|---|
| Capture | Toolbar Highlight toggle (pencil, `aria-pressed`), crosshair cursor, single-shot — turns off after one successful draw. `Escape` cancels an in-progress draw and exits. Drags under 10 CSS px cancel silently. No resize handles; redraw instead. Overlapping regions allowed. |
| Crop | Page re-rendered off-screen at a bounded, zoom-independent scale: longest edge targets 1400px, capped at 4 MP and 8×. Rotation handled by PDF.js's viewport. Render tasks and canvases cleaned up. The live drag outline never depends on this render. |
| Highlights | Rounded **outlines, never fills** — a wash would hide the figure the highlight points at. Lifecycle-coloured by status. One session maps to one rect and one hit target. Accessible name: `Highlight {n} on page {p} ({status})`. |
| Popover | Shared `SelectionPopover` extended with an optional `previewImageUrl`; the quoted-text line becomes a crop thumbnail. `Explain` is the only quick action. |
| Panel | Crop thumbnail, page metadata, question, one answer or one error. No composer, no follow-ups. |
| Text layer | Stays rendered and interactive for native selection/copy where the PDF has one. Disabled while Highlight mode is on. |
| Limits | 16 MB PDF, 250 pages, 4 MB crop. |

### Request flow

1. Browser opens and renders the PDF locally. No bytes leave the browser.
2. User draws a region; the reader stores the page-space anchor and renders the crop.
3. User submits a question. The browser posts multipart to `POST /api/document-thread`, including the full PDF **only** if it has no live prepared token for this document.
4. The server authenticates, validates digest / signatures / sizes, stores the PDF in an expiring in-memory record keyed by user + document digest + provider + model, and returns an opaque token with the answer.
5. Later questions send the token instead of the PDF. On `409 needsDocument` (expiry or process restart) the browser silently re-uploads and retries.

App-owned system instructions are authoritative. The PDF, crop, document name, and question are all treated as untrusted data.

### Provider contract (verified)

- `@ai-sdk/anthropic@3.0.44` converts a `file` part with `mediaType: "application/pdf"` into an Anthropic `document` block and adds the `pdfs-2024-09-25` beta itself. It honours per-part `providerOptions.anthropic.cacheControl = { type: "ephemeral" }`.
- The SDK has **no** `source: { type: "file", file_id }` path — the Files API is unreachable without hand-rolling Messages calls.
- Anthropic's Files API has **no TTL**, requires explicit `DELETE`, is workspace- not user-scoped, and the docs warn never to accept end-user `file_id`s. Wrong primitive for a session-only feature.
- **Consequence:** the "prepared document reference" is a server token over locally held bytes, not a provider file handle. The PDF is base64-inlined on every question; reuse comes from the ephemeral prompt cache, not a file id. This is a deliberate deviation from the original plan's wording.
- Anthropic caps a request at **32 MB** post-base64 and 600 pages at 1M context. Hence 16 MB + 4 MB ≈ 26.7 MB encoded, and the file limit dropped from 50 MB.
- `claude-sonnet-5`: active, 1M context, vision-capable; all active Claude models support PDF.

### Dormant code, kept not deleted

The text-stream / offset-anchor spike is off the critical path but retained in case a future citations or search feature wants precise text quoting:

- `lib/pdf/pdfTextStream.ts` and `__tests__/lib/pdf/pdf-text-stream.test.ts`
- In `lib/pdf/pdfSelectionAnchor.ts`: `resolveBoundaryOffset`, `getItemElement`, `getItemIndex`, `getOffsetWithinItem`, `resolvePdfSelection`, `capturePdfSelectionGeometry`
- `PdfTextAnchor`'s offset/exact/prefix/suffix fields in `lib/pdf/types.ts`

Still live and reused: `viewportRectToPdfQuad`, `pdfQuadToViewportRect`, `annotatePdfTextLayerItems`, `PdfPageQuad` / `PdfViewportLike` / `PdfViewportRect`, and the whole PDF fixture set.

Removed: `/api/paper-thread`, its route test, and the `PaperThreadSession` / `PaperThreadMessage` / `PaperThreadStatus` types.

### Test coverage

Unit: region geometry round-trips at four zoom levels and through a rotated viewport, drag normalisation, mis-click threshold, crop scale and pixel-rect resolution, prepared-document identity/expiry/eviction, and the endpoint's auth, validation, preparation, reuse, and cross-user rejection paths.

Playwright: draw → thumbnail popover → mocked answer → persistent labelled border → reopen by click and keyboard; zoom and rotated-page alignment to three decimals of relative position; mis-click cancel; Escape exit; image-only scan; error state; `409` re-prepare; native selection intact; plus the retained load-failure and load-race tests.

---

## 2. Worth adding or fixing

Ordered by value.

1. **Run the manual evaluation gate.** Nothing here has ever touched a live provider — every test mocks the endpoint. Evaluate one born-digital paper and one scan/figure-heavy PDF, including a dense equation, a table, and a diagram. Confirm the question feels fast enough, the crop is legible when the page is viewed zoomed out, and the answer demonstrably uses document-level context. Everything below item 2 is guesswork until this happens.

2. **Measure cold-start latency, then decide on streaming.** A cold full-document read currently shows only a "Thinking" indicator. Streaming is the right fix *if* the wait is genuinely long; adding it before measuring is speculative. Add cancellation only alongside streaming.

3. **`Show on page` has no emphasis.** It only scrolls. It should briefly pulse the border (thickness/colour), with `prefers-reduced-motion` falling back to instant static emphasis. Also: `scrollIntoView({ behavior: "smooth" })` overrides the CSS reduced-motion rule, so reduced-motion users still get a smooth scroll.

4. **The drag outline carries a white halo** (`box-shadow: 0 0 0 1px rgb(255 255 255 / 0.55)`), contradicting the "no decorative shadows or glow" design principle. It exists so a 1.5px border stays visible over dark figures. Either find a halo-free treatment that survives dark backgrounds, or accept it explicitly.

5. **Two threads created in quick succession both upload the full PDF**, because the token is only stored after the first response returns. Deferred by design ("no multiple concurrent document requests"), but worth an in-flight-preparation guard if it bites.

6. **No context-overflow guard.** A PDF can fit 250 pages and still overflow the window; the provider error surfaces as a generic failure. A page-count or token-estimate warning would fail more legibly.

7. **Native selection is blocked inside a persisted region**, since the clickable highlight sits above the text layer. Unavoidable given click-to-reopen, but currently undocumented in the UI.

8. **Unverified assumptions:** Anthropic rate limits were never checked; a real 16 MB relay through Next.js was never exercised end to end; the ephemeral cache has never been observed hitting on a second question.

9. **Naming drift.** `PaperThreadPanel` and the `.paper-thread-*` CSS classes now render region threads. Cosmetic; rename only if touching those files anyway.

---

## 3. Deliberately omitted — keep it that way

Do not build these until the evaluation gate has run and a concrete need appears.

| Omitted | Why it stays out |
|---|---|
| Model picker, document-specific persisted preference, effort controls, thinking toggles | Model selection is not part of this problem. One confirmed model is enough to prove the interaction. |
| Adding `claude-sonnet-5` to `lib/chat-models.ts` | Would surface it in main chat and imply catalog-level document support that `supportsImages` cannot express. |
| Multiple providers, provider-neutral document-cache abstraction | An abstraction over one implementation is a guess. Revisit when a second provider is intentionally supported. |
| Streaming, stop/cancel, run IDs, cancel endpoint, `active-run-registry` | Gated on item 2 above. Cancellation without streaming is pointless. |
| Cache warm-up when Highlight mode is enabled | An optimisation for a latency problem that has not been measured. |
| Cross-model cache invalidation, re-preparation UI | No model switching, so no invalidation. |
| Follow-up turns and thread history | Would broaden both the endpoint and the session contract for unproven value. One question, one answer. |
| Concurrent document requests, background-completion guarantees | Session-only scope; a reader asks one question at a time. |
| Rectangle editing, resizing, annotation lists, auto-captioning | Redrawing is cheap. A generic `Highlight {n}` label beats guessing at a region's content. |
| OCR, retrieval, citation/search extraction | Rectangle capture has no extraction dependency, and keeping it that way is the point of the pivot. |
| Drag-and-drop import | Trivial to add later; adds nothing to the core loop. |
| Database rows, object storage, IndexedDB, reload recovery, PDF persistence, fake chat conversations or `chat_runs` | The session-only boundary is what keeps this feature small and privacy-defensible. |
| Routing through `/api/chat` | Its `POST` handler is inline orchestration for durable, resumable, DB-backed conversations. Reusing it would mean inventing fake conversation and message rows. |
| Consolidating `ThreadPanel` / `PaperThreadPanel` duplication (`ChatMessageFrame`, thinking indicator, resizer, button styling) | Real duplication, but cleanup unrelated to this feature. |
| Linking `/paper-demo` into main navigation | It stays isolated and unlinked until the feature is proven. |
