# Usage Telemetry and Administration

Orchard records content-free model-call accounting on the server and exposes
aggregated usage to explicitly allowlisted administrators at `/admin`.
Collection starts when the telemetry migration and application code are in
place; there is no historical backfill.

## What is recorded

One `model_usage_calls` row represents one actual model-provider invocation.
Related calls share a request ID, so a response can be reported separately from
the title, search-planning, or retry calls it caused. Primary responses retain
both the requested model, including `auto`, and the resolved catalog model.

The row contains only accounting and operational scalars:

- user, request, optional run, call-kind, attempt, surface, and chat-mode IDs;
- requested, resolved, provider, and provider-model identifiers;
- terminal status, a normalized finish reason, and timing;
- normalized input, cache, output, reasoning, and total token counts; and
- an immutable estimated cost, pricing version, and cost-status label.

It never stores prompts, responses, titles, search queries, source URLs, raw
errors, or raw provider metadata. Temporary-chat calls use the same numeric
contract and do not gain a conversation or content identity.

Brave and Exa retrieval, Deepgram transcription, and text-to-speech are outside
the LLM cost estimate. The model calls used for search decisions and plans are
included.

## Dashboard metrics

The dashboard offers `7 days`, `30 days`, and `All time`. Each preset is a
half-open UTC interval, `[start, end)`, based on call start time. Dates and
timestamps are presented in the browser's locale; daily buckets remain UTC.

- **Registered users:** current rows in `profiles`, including users with no
  activity in the selected interval.
- **Active users:** distinct users with a primary response or mentor generation
  in the interval.
- **Responses:** distinct request IDs with a primary `chat_response` call.
- **Provider calls:** every recorded model invocation, including auxiliary and
  retry calls.
- **Estimated LLM cost:** the sum of call-time estimates for priced calls.
- **Estimated chat cost:** priced calls sharing a request ID with a primary
  response, including its title, search-planning, and retry calls.
- **Average chat cost:** estimated chat cost divided by response count.
- **Usage-reporting coverage:** completed calls with complete billable usage
  divided by completed calls.
- **Pricing coverage:** priced calls divided by calls with complete billable
  usage.

Unknown values stay unknown. If some calls report usage but have no registered
price, the visible total contains only priced calls and is marked partial.
Missing usage and missing prices are counted separately; neither becomes zero.

Model reporting groups primary calls by Orchard's resolved model. Auxiliary
runtime models without a catalog ID remain visible under provider plus exact
provider-model ID. The per-user table uses the Supabase user ID as canonical
identity; email is profile display metadata.

All-time figures cover retained accounts only. Deleting an account cascades its
telemetry rows, so later all-time totals no longer include that account.

## Access and failure boundaries

The normal authenticated-route proxy protects `/admin`, and the page performs a
second server-side check against `ORCHARD_ADMIN_USER_IDS` before creating the
elevated aggregate reader. Signed-out users are redirected to login. A signed-in
user outside the allowlist receives the ordinary not-found page.

Browsers cannot read or write `model_usage_calls` or execute its aggregate
functions. The table has RLS enabled, normal roles have no privileges, and only
the server-side service role can insert rows or call the fixed aggregate
functions. The admin page is dynamically server-rendered and forced no-store;
it receives aggregate rows rather than raw telemetry.

Telemetry finalization is best-effort, bounded, and outside the user-facing
generation failure boundary. A telemetry timeout or insert failure emits only
a fixed server diagnostic and does not fail or wait indefinitely on the model
response.

## Maintaining prices

The registry is `frontend/lib/telemetry/model-pricing.ts`. Entries are keyed by
provider and exact provider model ID. Each priced version includes its effective
time, immutable version label, official source URL, review date, token-category
rates, and provider-specific cache/reasoning behavior. Deliberately unpriced
models include a reason and source.

When a provider changes a rate:

1. Verify the official provider source and the exact API model identifier.
2. Add a new effective-dated version; do not rewrite a version used by recorded
   calls.
3. Update the review date and add pricing tests for thresholds, caching, and
   reasoning semantics.
4. Run the catalog-coverage and telemetry suites plus the database invariants.

If a rate is ambiguous, leave the cost unavailable and preserve the usage row.
Do not substitute zero. Historical call estimates remain immutable; invoice-
grade provider reconciliation is intentionally outside this beta dashboard.

## Related docs

- [Architecture](../architecture.md)
- [Local setup](../development/setup.md)
- [Testing](../testing/README.md)
- [Model selection](./chat-model-selection.md)
- [Live search](./live-search.md)
