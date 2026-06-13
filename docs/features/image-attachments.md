# Image Attachments

## Scope

Chat supports up to 5 image attachments per user message. The first version uses model-native vision only: images are sent to the selected multimodal model for the current turn. There is no OCR, indexing, or image memory extraction yet.

Client-accepted types for models/providers that support them:

- PNG
- JPEG
- WebP
- GIF

Each image is limited to 10MB.

The client and server apply provider-specific limits before invoking the model. For example, Google models reject GIF attachments in the composer; use PNG, JPEG, or WebP for those models.

## User Flow

Users can attach images by:

- Pasting an image into the composer
- Dragging and dropping image files
- Using the image picker button

Images upload only when the user sends the message. Before sending, the composer shows thumbnails and each thumbnail can be removed. On send, the pending thumbnails move into the transcript immediately using local preview URLs; the app uploads in the background, then replaces the optimistic attachment metadata with Supabase-backed URLs before calling the model. Clicking a thumbnail opens an in-app modal preview; it does not open a new browser tab.

## Data Flow

```text
Composer pending images
  -> optimistic user message with local thumbnails on send
  -> upload to private Supabase Storage bucket
  -> patch optimistic attachments with storage paths
  -> send storage paths to POST /api/chat
  -> API validates ownership, model support, provider limits, and downloads bytes
  -> API sends latest user message as text + image parts to the AI SDK
  -> persistent chats store message_attachments metadata
  -> transcript loads attachment metadata and renders stable image proxy URLs
```

Temporary chats upload images so the model can read them, but do not persist attachment metadata. When a temporary chat is closed, the client best-effort deletes associated storage objects.

## Storage

Images live in the private Supabase Storage bucket:

```text
chat-images/<user_id>/<uuid>.<extension>
```

Metadata for persistent messages lives in `public.message_attachments`.

The app serves persisted thumbnails through:

```text
GET /api/chat/images/:attachmentId
```

That route authenticates the user, verifies ownership, downloads from the private bucket, and streams the image response back with `private, no-store` cache headers. This avoids stale signed URLs in long-lived pages and keeps Storage URLs out of browser history.

## Validation

Validation happens in two places:

- Client: file count, MIME type, size, selected model image support, and Google GIF rejection before upload.
- Server: storage path ownership, count, MIME type, size, downloaded byte length, basic image signatures, resolved model image support, and provider-specific image limits before model invocation.

The model catalog exposes `supportsImages`. Provider limits live in `CHAT_IMAGE_PROVIDER_LIMITS`.

## Cleanup

The client removes uploaded objects when upload succeeds but chat submission fails before the turn is accepted.

Known cleanup boundaries:

- If the browser closes mid-request, uploaded objects may still become orphaned.
- If the server saves the user message but fails later, the image should remain with that message.
- A scheduled server-side orphan cleanup job is still a future hardening item.

## Future Work

- Add a server-side orphan cleanup job for old `chat-images` objects without `message_attachments` rows.
- Add OCR or image summaries for search, memory, and future-turn context.
- Add provider-specific resizing/conversion for large images.
- Add HEIC support for mobile uploads.
- Add modal focus trapping, zoom/pan, and arrow navigation.
