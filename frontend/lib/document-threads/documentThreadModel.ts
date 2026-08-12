import { anthropic } from "@ai-sdk/anthropic";

/**
 * The document-thread slice is pinned to one confirmed PDF- and image-capable
 * model. It is intentionally NOT registered in `lib/chat-models.ts`: this route
 * has no model switching, and the shared catalog's `supportsImages` flag is not
 * evidence of document support.
 *
 * Verified for `claude-sonnet-5`:
 * - PDF input via an Anthropic `document` block (`@ai-sdk/anthropic` emits this
 *   for a `file` part with `mediaType: "application/pdf"` and adds the
 *   `pdfs-2024-09-25` beta itself).
 * - Image input via a `file` part with an `image/*` media type.
 * - Prompt caching via per-part `providerOptions.anthropic.cacheControl`.
 * - Request payload cap of 32 MB and 600 pages at this model's 1M context.
 */
export const DOCUMENT_THREAD_PROVIDER = "anthropic" as const;
export const DOCUMENT_THREAD_MODEL_ID = "claude-sonnet-5" as const;
export const DOCUMENT_THREAD_MODEL_LABEL = "Claude Sonnet 5" as const;
export const DOCUMENT_THREAD_API_KEY_ENV = "ANTHROPIC_API_KEY" as const;

export function isDocumentThreadModelConfigured() {
  return Boolean(process.env[DOCUMENT_THREAD_API_KEY_ENV]);
}

export function getDocumentThreadModel() {
  return anthropic(DOCUMENT_THREAD_MODEL_ID);
}

export function getDocumentThreadUnavailableMessage() {
  return `Document threads need ${DOCUMENT_THREAD_API_KEY_ENV} to be configured.`;
}
