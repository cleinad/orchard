# Response Style

Response style lets a user tune how answers are taught in each chat.

It controls two independent dimensions:

- **Length:** how complete and expansive the answer should be
- **Level:** how much prior knowledge the answer should assume

The setting applies to main replies, branches, and inline threads submitted from
that chat.

## Length

- `Adaptive` — match the answer's length to the current request
- `Concise` — the shortest complete answer, without a rigid sentence count
- `Brief` — direct and skimmable
- `Detailed` — structured explanation with useful examples or steps
- `Deep` — focused depth, with context and tradeoffs where useful

## Level

- `Adaptive` — match the explanation to the user's demonstrated familiarity
- `New` — start from fundamentals and define terms
- `Familiar` — assume the basics
- `Advanced` — skip basics and emphasize nuance
- `Fluent` — use precise, domain-native language without sacrificing clarity

Both dimensions default to `Adaptive`. The trigger shows simply `Response style`
while the default is active. Each explicit choice affects only its own dimension;
the selected guidance is sent directly with the chat request, without a separate
classification or prompt-routing call.

## Custom instruction

The popover also accepts a short instruction for the current chat. The server
places it in a delimited prompt block and treats it as overriding the selected
length or level when they conflict.

Input is normalized and limited to 1,000 characters.

## Persistence

Response style is keyed to the current chat or draft and serialized to browser
`sessionStorage`. It is not a field on the persisted conversation.

Changing chats restores each chat's session setting. A new chat starts with the
default unless its initial-send handoff already contains a style.

## Key implementation

- `frontend/lib/response-style.ts`
- `frontend/app/home/components/ResponseStylePicker.tsx`
- `frontend/app/home/components/usePerChatComposerState.ts`
- `frontend/app/api/chat/route.ts`

## Verification

- `frontend/__tests__/lib/response-style.test.ts`
- `frontend/__tests__/app/home/usePerChatComposerState.test.ts`
- response-style cases in `frontend/__tests__/app/chat-route.test.ts`

## Related docs

- [Global instructions](./global-instructions.md)
- [Model selection](./chat-model-selection.md)
- [Multi-chat home](./multi-chat-home.md)
- [Inline threads](./inline-threads.md)
