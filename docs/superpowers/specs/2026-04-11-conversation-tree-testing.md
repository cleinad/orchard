# Conversation Tree Testing Strategy

Date: 2026-04-11
Status: Draft for review
Related design: [Conversation Tree Design](./2026-04-11-conversation-tree-design.md)

## Approved Testing Strategy

This feature needs coverage at 3 levels, because most failures will come from path reconstruction and state transitions rather than isolated UI pieces.

### 1. Route and data-shape tests

Extend the existing `chat-route` style tests to verify:

- normal replies append with the correct `previous_message_id`
- first fork from an older assistant reply creates:
  - a new branch entry message
  - a `conversation_branches` row
  - a `Main` branch row for the preserved original continuation
- continuing an existing branch appends only to that branch path
- prompt history is assembled from the active path only
- sibling branches are excluded from generation context
- branch sends do not touch inline-thread persistence
- memory extraction for branches only receives user-stated facts and commitments, not assistant speculation

### 2. Client and state tests

Add focused frontend tests for the path renderer and branch selection model:

- branch chips appear only on assistant replies with multiple continuations
- clicking a chip swaps only the downstream transcript
- clicking `+ Branch` arms a pending branch without opening a new composer
- the next send goes into that new branch
- cancelling a pending branch returns the composer to the current active path
- reopening a conversation restores the last active branch-selection map or a deterministic default

These can mostly sit near the home screen state and hooks rather than being full browser tests.

### 3. E2E fixture coverage on `/home`

Use the same style as the inline-thread fixtures: deterministic seeded chat trees, mocked `/api/chat`, and no live Supabase dependence.

Key E2E cases:

- create first branch from the current assistant reply
- create first branch from an older assistant reply
- switch between `Main` and a sibling branch via chips
- create nested branches at multiple levels
- use the top-right navigator to jump to a branch point and switch there
- verify the bottom composer targets the selected or pending branch
- verify inline selection threads still work inside a conversation that also has full-reply branches
- verify reload persistence for branch state in saved chats
- verify temporary chats use the same branch behavior during the session

### Important regression scenarios

- the original continuation disappears after first fork
- switching one branch point incorrectly changes another branch point
- branch chips render on the wrong message
- active-path transcript includes messages from sibling branches
- memory or prompt context leaks across branches
- inline-thread UI and branch-chip UI visually or behaviorally collide

### Expected implementation outcome

This testing strategy should lead to:

- new route or unit tests for branch persistence and history assembly
- new fixture-driven Playwright coverage similar to the inline-thread suite

## Future Refinement

- Add a concrete fixture inventory once the first implementation plan defines the test slices.
- Assign test file ownership and placement alongside the implementation plan.
- Turn the regression list into a rollout gating checklist before shipping.
