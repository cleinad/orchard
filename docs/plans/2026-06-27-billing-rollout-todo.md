# Billing rollout TODO

This is a handoff checklist for the billing/model-limit work after merging `main` into the billing branch. Treat this file as a temporary working artifact, not part of the final product commit unless explicitly desired.

## Current state

- Merge conflicts have been resolved in the billing/model-selection area.
- The app code now models three plans: `free`, `keen_plus`, and `keen_pro`.
- Chat usage is intended to be limited by both monthly backstops and 3-hour rolling windows.
- Premium/max models are intended to consume premium usage units in addition to total message count.
- A new forward migration exists because `20260612120000_stripe_billing.sql` was already applied elsewhere.
- Tests and typecheck have not been run yet.

## Files to treat carefully before committing

- `supabase/migrations/20260612120000_stripe_billing.sql`: this migration was already applied. Do not rely on edits here for deployed databases. Prefer the new forward migration for remote/staging/prod.
- `supabase/migrations/20260627120000_chat_usage_limits_forward.sql`: new migration that should be applied after the already-applied Stripe billing migration.
- `frontend/test-results/.last-run.json`: currently deleted in the worktree. Confirm this deletion is intentional before staging.
- `STRIPE.md`, `stripe-done.md`, `stripe-review.md`, `stripe-test.md`: untracked local notes. Confirm whether these belong in the WIP commit or should stay untracked.
- `docs/plans/2026-06-27-billing-rollout-todo.md`: this handoff file. Usually keep it uncommitted or remove it before a polished final commit.

## Remaining implementation work

### Task 1: Finalize DB migration rollout

**Files:**
- Keep: `supabase/migrations/20260627120000_chat_usage_limits_forward.sql`
- Review: `supabase/migrations/20260612120000_stripe_billing.sql`

- [ ] Apply the new forward migration locally or in a disposable Supabase branch.
- [ ] Confirm existing `usage_counters` rows survive the `date` to `timestamptz` conversion.
- [ ] Confirm `consume_chat_usage_limits` exists and can be called by authenticated users and service role.
- [ ] Decide whether to revert edits to the already-applied `20260612120000_stripe_billing.sql` or keep them only as the desired baseline for fresh installs.
- [ ] Completion criteria: existing deployed DBs can move forward using only the new migration.

### Task 2: Configure Stripe Plus and Pro prices

**Files:**
- Modify/check deployment env, not necessarily repo files.
- Relevant app code: `frontend/lib/billing-config.ts`, `frontend/app/api/billing/checkout/route.ts`, `frontend/lib/stripe-billing.ts`

- [ ] Create or identify Stripe Product/Price IDs for Plus monthly and Pro monthly.
- [ ] Set `STRIPE_PRICE_PLUS_MONTHLY_ID`.
- [ ] Set `STRIPE_PRICE_PRO_MONTHLY_ID`.
- [ ] Keep `STRIPE_PRICE_MONTHLY_ID` only as a legacy Plus fallback if needed.
- [ ] If annual billing is desired now, add annual price IDs and checkout selection support before launch.
- [ ] Completion criteria: webhook projection maps active Stripe subscriptions to `keen_plus` or `keen_pro` correctly.

### Task 3: Finish plan selection UX

**Files:**
- Likely modify: `frontend/app/settings/billing/page.tsx`
- Possibly modify: `frontend/app/api/billing/checkout/route.ts`

- [ ] Add a clear Plus vs Pro selection path if users should be able to buy either plan.
- [ ] Make displayed limits match `frontend/lib/billing-config.ts`.
- [ ] Decide whether annual discount copy belongs in this pass or later.
- [ ] Completion criteria: a user can intentionally pick Plus or Pro and lands in checkout for the correct Stripe price.

### Task 4: Validate model gating and usage accounting

**Files:**
- Relevant: `frontend/lib/billing-config.ts`
- Relevant: `frontend/lib/models.ts`
- Relevant: `frontend/lib/billing.ts`
- Relevant: `frontend/app/api/chat/route.ts`
- Relevant: `frontend/app/api/chat/models/route.ts`

- [ ] Confirm free users can use only `auto` as the requested model.
- [ ] Confirm free users are not blocked when `auto` resolves internally to a concrete provider model.
- [ ] Confirm Plus and Pro users can choose concrete models.
- [ ] Confirm premium/max models consume premium units as expected.
- [ ] Confirm standard models only consume total message quota.
- [ ] Completion criteria: plan enforcement happens server-side, not only in UI state.

### Task 5: Validate tests and TypeScript

**Files:**
- Relevant tests under `frontend/__tests__/app/`
- Relevant tests under `frontend/__tests__/lib/`
- Relevant docs under `docs/testing/`

- [ ] Run the focused billing/model tests.
- [ ] Run TypeScript/typecheck.
- [ ] Fix any test fixtures missing new entitlement fields: `rollingWindowHours`, `rollingLimit`, `monthlyPremiumUnitLimit`, `rollingPremiumUnitLimit`.
- [ ] Fix any mocks that still expect old `consume_model_usage` behavior.
- [ ] Completion criteria: billing, chat route, model catalog, and Stripe webhook tests pass.

### Task 6: Manual smoke test the subscription lifecycle

**Files:**
- No code changes expected unless bugs are found.

- [ ] New free user: can chat with `auto`, cannot choose a concrete model.
- [ ] Plus checkout: creates subscription, webhook stores entitlement, user receives Plus limits.
- [ ] Pro checkout: creates subscription, webhook stores entitlement, user receives Pro limits.
- [ ] Cancel at period end: display state and entitlement behavior remain correct.
- [ ] Payment failure or inactive subscription: user falls back to free access.
- [ ] Completion criteria: billing state transitions match Stripe state and do not grant stale paid access.

### Task 7: Clean up commit scope

**Files:**
- Review full `git status --short` before staging.

- [ ] Decide whether the response-style/study-control files are intentionally part of the same WIP commit.
- [ ] Decide whether docs changes belong in the same WIP commit or should be split later.
- [ ] Do not stage `frontend/test-results/.last-run.json` deletion unless intentional.
- [ ] Do not stage untracked Stripe note files unless they are meant to become repo docs.
- [ ] Keep this plan file uncommitted unless explicitly choosing to commit handoff notes.
- [ ] Completion criteria: WIP commit contains only intentional branch work and no local artifacts.

## Suggested validation commands

Run these only when ready to validate:

```bash
cd frontend && npm test -- --runInBand __tests__/lib/billing.test.ts __tests__/lib/models.test.ts __tests__/app/chat-route-billing.test.ts __tests__/app/chat-models-route-billing.test.ts __tests__/app/stripe-webhook-route.test.ts
```

```bash
cd frontend && npm run typecheck
```

If the repo uses a different test runner command, use the project-standard equivalent from `frontend/package.json`.

## WIP commit readiness

A WIP commit is reasonable after deliberate staging, but not as a blind `git commit` right now.

Reasons:

- There are mixed staged/unstaged files, so the index does not necessarily represent the final intended snapshot.
- There are untracked local Stripe note files that may not belong in the repo.
- The new forward migration should be included, but the already-applied migration needs an explicit decision.
- Validation has not been run.

Recommended WIP commit approach:

- Stage all intentional source, test, docs, and migration changes.
- Exclude local notes, generated test result state, and this temporary plan file unless explicitly wanted.
- Use a WIP message that makes the risk clear, for example: `wip: merge billing limits with expanded model catalog`.
