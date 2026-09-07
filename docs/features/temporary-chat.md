# Temporary Chats

Temporary chats keep conversation state in the current browser session instead
of the application database.

They are not a "save and delete later" path. Chat content, messages, titles,
branches, inline threads, search results, and run records are not written to
Supabase.

## Privacy boundary

Temporary prompts and attachments still transit the Orchard server and selected
model provider. Live search requests also reach configured search providers
when search is enabled.

The privacy guarantee is therefore about Orchard's database persistence, not
about keeping content entirely on the device.

## User behavior

- Create a temporary chat from the sidebar.
- Temporary chats appear in their own collapsible section.
- Each chat has a local title and can be closed individually.
- Closing it removes its chat, branch, thread, and run state.
- Temporary chats do not have durable URLs.

Temporary chats survive navigation within the same tab because they are
serialized to `sessionStorage`. They disappear when that browser session ends
or its storage is cleared.

## Supported chat behavior

Temporary chats support:

- model selection and effort controls
- response style
- Off, Auto, and Always search modes
- image attachments
- conversation branches
- inline threads

The client sends the active main-path and thread histories with each request
because the server cannot load them from persisted messages.

## Images

Images are uploaded to the private chat-image bucket so the server can send
them to a model. Because there is no persisted message to own them, Orchard
tracks their storage paths in temporary session state and attempts cleanup when
the chat closes.

## Execution limits

Temporary runs are coordinated locally. They can stream and be cancelled while
the current page is alive, but they have no durable server run record for
recovery after the browser session is lost.

## Key implementation

- `frontend/app/home/components/HomeDataContext.tsx`
- `frontend/app/home/components/useMainChatRuntime.ts`
- `frontend/app/home/components/useInlineThreadRuntime.ts`
- `frontend/lib/chat-runs/storage.ts`
- `frontend/app/api/chat/route.ts`

## Verification

Temporary behavior is covered across:

- `frontend/e2e/home-routing.spec.js`
- `frontend/e2e/inline-threads.spec.js`
- `frontend/e2e/chat-run-lifecycle.spec.js`
- `frontend/__tests__/app/chat-route.test.ts`

## Related docs

- [Multi-chat home](./multi-chat-home.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)
- [Inline threads](./inline-threads.md)
- [Image attachments](./image-attachments.md)
