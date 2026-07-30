# Global Instructions

Global instructions are account-level guidance applied to every conversational
response. They let a user establish standing preferences without repeating them
in each chat.

## Editing

The Settings page provides a multiline editor with explicit Save and Discard
actions. Instructions are optional and limited to 4,000 characters.

The value is stored on the authenticated user's profile. Existing profile
row-level security limits reads and updates to that user. The signup trigger
creates the profile before the user reaches Settings; a missing row is treated
as a database invariant failure rather than partially reconstructed by the
browser.

## Prompt behavior

The chat route loads global instructions from the authenticated profile rather
than accepting them in the request body. Non-empty instructions are placed in a
delimited system-prompt block after Orchard's base or mentor prompt and before
workspace context.

The effective order is:

1. Orchard's base or mentor instructions and reply metadata
2. Global instructions
3. Workspace instructions, when applicable
4. Search grounding, when applicable
5. Per-chat response style and custom guidance
6. Response-formatting requirements

Global instructions apply to main replies, temporary chats, branches, mentor
chats, and inline threads. They do not apply to auxiliary model calls such as
conversation-title generation or search planning.

## Privacy

Global instructions are sent to the selected model provider as part of the
system prompt for each conversational response. They are not part of the
conversation transcript and are not logged separately by Orchard.

## Key implementation

- `frontend/lib/global-instructions.ts`
- `frontend/app/settings/page.tsx`
- `frontend/app/components/useViewerIdentity.ts`
- `frontend/app/api/chat/route.ts`
- `supabase/migrations/20260729130000_add_global_instructions.sql`

## Verification

- `frontend/__tests__/lib/global-instructions.test.ts`
- `frontend/__tests__/app/chat-route.test.ts`
- `frontend/__tests__/supabase/global-instructions-migration.test.ts`
- `frontend/e2e/settings.spec.js`
- `supabase/tests/database.sql`

## Related docs

- [Response style](./response-style.md)
- [Workspaces](./workspaces.md)
- [Architecture](../architecture.md)
