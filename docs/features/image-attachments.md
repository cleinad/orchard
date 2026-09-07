# Image Attachments

Chats accept image attachments through paste, drag and drop, or the file picker.
Images are passed directly to vision-capable chat models; Orchard does not
perform OCR or indexing.

## Limits

- up to 5 images per message
- up to 10 MiB per image
- PNG, JPEG, WebP, and GIF at the shared validation layer
- provider-specific MIME restrictions may be narrower

The client validates before upload, and the server validates attachment
metadata, ownership, size, type, and selected-model support again before
generation.

## Flow

1. The client creates local previews and validates the selection.
2. Authenticated browser code uploads files to the private `chat-images`
   Supabase Storage bucket.
3. The chat request sends attachment IDs and metadata.
4. The server verifies ownership and storage paths, downloads the files, and
   sends image parts to the model.
5. Persistent message attachments are recorded in `message_attachments`.
6. The transcript loads images through the authenticated
   `/api/chat/images/<attachmentId>` route.

The server never accepts an arbitrary client-supplied public image URL as model
input.

## Later turns

For a text-only follow-up, the server may reattach the most recent earlier user
image turn, subject to the selected provider's limits. New images on the current
turn take priority.

## Temporary chats

Temporary images use the same private bucket because the server must retrieve
them for model input. Their paths are tracked in session state rather than
attached to persisted messages, and the client attempts cleanup when the
temporary chat closes.

## Cleanup

Files uploaded for a request that fails before acceptance are removed when the
client can identify them. Deleting a workspace also removes the attachment
paths returned by the database deletion function.

There is currently no scheduled server-side orphan sweeper.

## Key implementation

- `frontend/lib/chat-attachments.ts`
- `frontend/app/home/components/chatImageUploads.ts`
- `frontend/app/home/components/useChatImageComposerState.ts`
- `frontend/app/api/chat/images/[attachmentId]/route.ts`
- `frontend/app/api/chat/route.ts`

## Verification

- `frontend/__tests__/app/chat-image-route.test.ts`
- image cases in `frontend/__tests__/app/chat-route.test.ts`
- upload cases in `frontend/e2e/workspaces.spec.js`

## Related docs

- [Model selection](./chat-model-selection.md)
- [Temporary chats](./temporary-chat.md)
- [Workspaces](./workspaces.md)
