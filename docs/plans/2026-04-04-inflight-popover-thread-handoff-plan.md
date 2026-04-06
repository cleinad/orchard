# In-Flight Popover To Thread Panel Handoff Plan

**Goal:** Make `Ctrl+L` behave correctly when the selection popover already has a request in flight.

## Exact Problem

There are currently two `Ctrl+L` behaviors that work conceptually:

- if the user has typed into the popover but has not sent anything yet, `Ctrl+L` should open the thread panel with that text still unsent
- if the popover already has a completed concise answer, `Ctrl+L` should open the thread panel with that seeded thread context preserved

The broken case is the middle state:

- the user has already submitted a question from the popover
- the request is still loading
- the user presses `Ctrl+L`

What happens now is:

- the thread panel opens
- the original submitted question reappears in the thread panel input as unsent draft text
- there is no assistant response yet
- the loading state is not transferred
- the original popover request result is effectively discarded

From the user perspective, it looks like the question was cancelled.

## Why This Happens

The popover currently models only two useful states:

- draft text that has not been submitted yet
- completed response state after the concise answer returns

It does not model a third, distinct state:

- submitted but still in flight

Because of that, `Ctrl+L` has no way to distinguish:

- text still sitting in the input
- text that has already been sent and should now be represented as an active loading thread turn

As a result, the submitted question is treated like unsent draft text during the handoff.

There is also a stale-request protection path that intentionally discards popover results once the popover selection context is no longer active. That behavior is correct for avoiding stray updates, but it means the in-flight result cannot complete back into the popover after promotion.

## Correct Product Behavior

The behavior should be:

### 1. Unsent draft

If the request has not been sent yet and the user presses `Ctrl+L`:

- the thread panel opens
- the input is populated with the draft text
- the text remains unsent

### 2. Submitted and loading

If the request has already been sent and is still loading when the user presses `Ctrl+L`:

- the thread panel opens
- the submitted question should appear as the active user turn
- the thread panel should show the thinking/loading state
- the input should be cleared
- the request should continue as thread context rather than reverting to an unsent draft

### 3. Completed response

If the concise response has already completed and the user presses `Ctrl+L`:

- the thread panel opens
- the existing question/answer pair is preserved
- any follow-up draft text remains unsent in the thread panel input

## Recommendation

Introduce an explicit popover state for "submitted but not yet resolved."

The popover state model should separately track:

- current editable draft input
- most recently submitted question
- whether that submitted question is still loading
- completed seeded thread messages, if the response has already returned

Then `Ctrl+L` should branch in this order:

- if there is a submitted in-flight question, promote that as active thread loading state
- else if there is a completed seeded response, promote the existing thread context
- else promote the current draft as unsent input

## Recommended Implementation Direction

The cleanest design is to treat the popover-to-thread transition as a state transfer, not a reinterpretation.

That means:

- unsent input transfers as draft input
- submitted in-flight input transfers as an already-started thread turn
- completed concise responses transfer as seeded thread history

This avoids the current ambiguity where one text field is being used to represent both:

- "what the user is typing"
- and "what the user already submitted"

## Important Constraint

Do not solve this by simply stuffing the loading question back into the thread panel input.

That recreates the exact bug:

- the request looks unsent
- the loading state disappears
- the original request result has nowhere valid to land

## Desired Outcome

After the fix:

- `Ctrl+L` before submit keeps text unsent
- `Ctrl+L` during loading preserves the submitted question and loading state
- `Ctrl+L` after completion preserves the seeded concise exchange
- the user never sees a submitted request turn back into editable draft text
