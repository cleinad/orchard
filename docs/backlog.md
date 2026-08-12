# Backlog

This is the single home for work that is not shipped: bugs, improvements,
feature ideas, and longer-term directions.

Feature and architecture documents describe current behavior only. When an item
ships, update the relevant current-behavior document and remove the item here.
Git preserves the history.

## Focus

Keep this section to at most three items. It should answer, "What matters most
right now?"

- [ ] Finish replacing the old product identity in user-facing application
  copy and default-chat language.
- [ ] Add bring your own api key
- [ ] Open source it?

## Bugs

Add confirmed user-visible defects here. Include a reproduction or link when it
is not obvious.

- [ ] Inline threads can be created against a reply that is still streaming.
  `useHomeThreads` skips streaming replies by testing whether the message id
  starts with `streaming-`, but run identifiers are `crypto.randomUUID()`
  values, so the check never matches. Selecting text in a partly streamed reply
  stores offsets that keep moving as tokens arrive.

## Important improvements

- [ ] Add server-side cleanup for image uploads that are abandoned before a
  message is saved.
- [ ] Validate and tune live search against real provider traffic.
- [ ] Add keyset sidebar pagination when real account distributions justify
  loading beyond the current 200-conversation and 100-workspace bootstrap.
- [ ] More keyboard shortcuts

## Feature ideas

- [ ] Add optional study presets such as "Teach me," "Deep study," and "Quiz
  me" on top of the existing response-style controls.
- [ ] Add OCR or image summaries when images need to participate in search or
  later turns beyond the current model-native context window.
- [ ] Add richer source handling if message-level search metadata becomes too
  limiting.
- [ ] PDF handling

## Long-term directions

- Explore lightweight ways to summarize a learning path across its main chat,
  branches, and inline threads without requiring manual note organization.
- Explore source-backed learning views only when they strengthen the core
  thread-and-branch experience.

## Using this file

- Capture a new idea in one sentence; polish it only when it becomes important.
- Move at most three items into **Focus**.
- Use labels in the prose only when they add information; avoid elaborate
  scoring systems.
- Create `docs/plans/<descriptive-name>.md` only when active work needs
  decisions, phases, or acceptance criteria that do not fit in one backlog
  item.
- Link the backlog item to its plan while the plan is active.
- Do not keep completed checklists or speculative roadmaps in feature docs.
