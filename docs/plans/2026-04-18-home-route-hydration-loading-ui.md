# Handoff: Route conversation loading UI (temporary doc)

**Status:** Implemented on 2026-04-20; route-exit follow-up added on 2026-04-21.  
**Audience:** Codex (or any implementer).  
**Created:** 2026-04-18  
**Updated:** 2026-04-21 (implementation outcome + temporary-chat route-exit follow-up)

---

## Clarification: nothing removed “route hydration” for chats

**Persistent conversation route hydration** (load metadata + messages when `routeConversationId` is set) still lives entirely in:

`frontend/app/home/[[...conversationId]]/page.tsx` — search for `loadSelectedConversation`, `hydratedRouteConversationIdRef`, and the `useEffect` that depends on `routeConversationId`.

What changed elsewhere does **not** affect that flow:

- `HomeDataProvider` only gates **`refreshSidebarData()`** on mount when `skipInitialSidebarRefresh` is true (home `?e2e=…` fixtures). That is the mentor/conversation **list** fetch, not per-conversation message hydration.
- Sidebar shell moved to `frontend/app/home/layout.tsx` + `HomeDataContext.tsx`; the page still owns `persistentMessages` and the route-driven load effect.

---

## Problem (this doc’s original scope)

On a **cold** navigation or full reload to `/home/<conversationId>`, the main `ConversationView` shows the **large empty-state hero** (same as a brand-new chat) while history is still loading.

**Root cause:** `ConversationView` branches only on `messages.length === 0`. It does not distinguish “no messages in state yet because history is in flight” from “this chat truly has no messages.” The `isLoading` prop (`isActiveConversationLoading` in `page.tsx`) reflects **send-in-flight**, not **history fetch**.

---

## Proposed fix (original intent)

1. **Page:** Add `isRouteConversationLoading` (or similar), updated only in the **same** `useEffect` that runs `loadSelectedConversation`, with existing `requestId` stale-guard.
2. **`ConversationView`:** If `messages.length === 0 && isRouteConversationLoading`, show blank or small spinner; else keep current empty hero.
3. **Optional:** Neutral header label while loading.

---

## Files to touch (implementation)

| File | Change |
|------|--------|
| `frontend/app/home/[[...conversationId]]/page.tsx` | Loading flag around `loadSelectedConversation`; pass prop to `ConversationView`. |
| `frontend/app/home/components/ConversationView.tsx` | Branch empty state on loading vs true empty. |

Do **not** overload `isActiveConversationLoading` for history load.

---

## Implementation outcome

The original route-loading UI shipped in `frontend/app/home/[[...conversationId]]/page.tsx` and `frontend/app/home/components/ConversationView.tsx`.

Implemented behavior:

- direct loads of `/home/<conversationId>` no longer show the large empty-chat hero while history is still hydrating
- routed history load uses dedicated page-level loading/error state instead of reusing send-in-flight loading
- the main conversation now streams assistant text in place, with a distinct `awaiting-response` phase before first token and a `reconciling` phase while persisted state reloads after the stream closes
- route hydration preserves the current transcript while that streaming reconciliation reload is happening so the transcript does not flash empty

---

## 2026-04-21 follow-up: temporary chat route-exit race

After the loading UI shipped, a follow-up bug showed up when leaving `/home/<conversationId>` for a temporary or draft chat:

- first click navigated back to `/home`
- but the old routed persistent conversation could briefly reclaim selection during route normalization
- the target temporary chat then required a second click to become active again

The applied fix was to keep the routed persistent transcript in memory until the URL has actually left `/home/<conversationId>`, instead of clearing that state at the very start of `prepareForChatSwitch(...)`.

Why this works:

- route hydration uses `persistentMessages.length` as one of its guards
- clearing persistent transcript state too early retriggered hydration for the old routed conversation
- preserving that state through the route exit stops the old conversation from stealing selection back

Known follow-up:

- this leaves a small visual flicker because the old routed transcript can remain visible for one route frame while `/home` settles
- a cleaner future follow-up would add an explicit "leaving routed conversation" transition state instead of relying on temporary overlap

---

## Related architecture (since first draft of this doc)

| Area | Where it lives now |
|------|---------------------|
| Sidebar open state + scroll requests | `SidePanelContext` + `frontend/app/home/layout.tsx` |
| Mentor list, drafts, temp chats, selection, handoff sessionStorage | `HomeDataContext.tsx` (`HomeDataProvider`) |
| `prepareForChatSwitch` registration | Page registers into context; **`invokePrepareForChatSwitch`** is the stable entry for async route code |
| `selectedChatRef` sync with `selectedChat` | Updated each render inside `HomeDataProvider` (page still sets ref directly in a couple places where same-tick ordering matters, e.g. promotion) |
| Initial sidebar list fetch on mount | `HomeDataProvider` — skipped when layout passes `skipInitialSidebarRefresh` (e2e fixtures) |
| Mentor detail / create mentor on `/home` | **Removed** from `home/layout.tsx`; `/mentors` keeps its own panels |

---

## Acceptance criteria

- Cold load `/home/<id>`: no full marketing empty hero while history loads; placeholder or spinner instead.
- After load: normal transcript (or true empty hero only if zero messages).
- `/home` draft/temp/new: unchanged when not in route-history loading mode.
- Send-in-flight dots unchanged when messages exist.

---

## After merge

This file is now historical context. Keep it only as a dated implementation note until the follow-up flicker polish is either shipped or intentionally dropped.
