# Diagnostics runbook

Status: D0–D4 implemented 2026-11-07. No external notifications are sent. The
app has no operator login: inspection stays on the CLI.

## 1. Collect a report from the device

Ask the parent to open **Help → Diagnostics** on the home or story screen (also
linked from the connection-failure card), then **Save or share diagnostics**.
The JSON bundle works offline and contains:

- build, platform and coarse runtime;
- effective backend origin, connection/reconnect counts and pending writes;
- the bounded local event timeline and the two connection checks;
- opaque operation IDs that can be joined to server records.

The exported bundle redacts private hosts and never contains story links, story
or chapter IDs, prose, prompts, names, images or filesystem paths. Treat a
screenshot of the on-device panel as private: it shows the full local origin.

## 2. Find the operation

Client events carry `operationId`. Server summaries are indexed by operation,
story and start time.

```bash
cd frontend
node scripts/diagnostics.mjs recent --story <storyId>
node scripts/diagnostics.mjs recent --limit 25
node scripts/diagnostics.mjs trace <operationId>
node scripts/diagnostics.mjs trace <operationId> --limit 50 --cursor <cursor>
node scripts/diagnostics.mjs health
```

Add `--prod` for the hosted deployment. The script wraps
`npx convex run diagnostics:trace` / `diagnostics:recent` / `diagnostics:health`;
all are internal queries. Reads are paginated: follow `continueCursor` until
`isDone` is true. The default trace page is 100 events; the default recent page
is 25 summaries.

`health` returns:

- `stuck`: started operations older than the generation lease;
- `failed` / `degraded`: terminal summaries in the last 24 hours;
- `quota`: stored events, operations, bytes and dropped count;
- `expired`: rows past `expiresAt` still waiting for cleanup;
- `limits`: the configured deployment budget.

## 3. Interpret the trace

- `operation.started` / `operation.succeeded|failed|degraded|superseded|recovered`
  is the summary. One operation has one terminal status.
- `provider.attempt.started|failed|retry|result` is one transport attempt.
  A logical provider call may have up to four attempts. An optional prose
  expansion is a second call, not attempt five.
- `retryable` says whether another attempt was possible; the actual decision is
  `willRetry` / `provider.attempt.retry`.
- `operation.degraded` with `PROSE_EXPANSION_FAILED` means the first valid draft
  was kept. `export.degraded` means the cover failed and the EPUB was still
  built.
- `operation.recovered` from a watchdog means the action crashed or was
  terminated; the domain state was released, but the cause may only be in the
  console log.
- A start with no end is evidence of an incomplete trace, not proof of a cause.
- Client action events carry an `operationId` that is passed to the server as
  `clientOperationId`. Use it with `trace` to join the report to the server
  timeline. It is a label only, never authorization.
- Unknown charges stay unknown. Diagnostics never estimate a price as actual.

## 4. Usage, receipts and baseline

Normal generation records a receipt per provider attempt. A receipt keeps the
provider request id when one exists, usage when reported, and the cost basis
(`reported`, `estimated`, `settled`, `unknown`). Missing cost is unknown, never
zero. Failed and timed-out attempts still get an unknown-charge receipt.

```bash
cd frontend
node scripts/diagnostics.mjs usage --since 2026-11-01 --until 2026-11-08
node scripts/diagnostics.mjs metrics --since 2026-11-01
node scripts/diagnostics.mjs baseline
```

`usage` returns:

- `totals.knownCostMicroUsd`: each known charge counted once;
- `totals.settledCostMicroUsd` and `totals.reportedCostMicroUsd` separately;
- `totals.unknownCostAttempts`: attempts whose charge is not known;
- `byProvider`, `byPurpose`, `byModel` buckets;
- `truncated` when the bounded window is full.

Reconcile a known request id without overwriting the original observation:

```bash
node scripts/diagnostics.mjs reconcile \
  --provider surplus --request-id <id> \
  --state charged --settled-micro-usd 1200 --currency USD
```

`metrics` returns operation success/failure/degraded counts, per-operation status
counts (including export/cover), p50/p95 durations, queue delay, watchdog
recoveries, provider attempt latency and retry rate, and image byte reduction.
`baseline` runs health, usage and metrics together.

Query time-to-first-result, reconnection outcome and delivery handoff stay in
the on-device report; there is no population-wide client ingestion in v0.

Do not treat one successful sample price as the actual cost of a book. Compare
reported and settled receipts, and keep unknown-charge attempts visible. Budget
reservation/enforcement is separate from these observations.

Alerts are not sent automatically. Run `baseline` a few times, then choose an
operator destination and thresholds with a minimum sample size, deduplication
and a recovery notice.

## 5. Console and platform logs

```bash
cd frontend
npx convex logs --history 50 --success
docker compose logs --tail 100 backend
```

Console lines are JSON under the `diagnostics` key. Raw platform logs may
contain historical unsanitized data and must be inspected before sharing.

## 6. Deployment/build mismatch and source maps

Compare the bundle's `buildId` and `effectiveOrigin` with the deployment being
investigated. A stale web bundle can keep calling an old origin after a deploy;
reload the page or rebuild before blaming the backend.

Release builds should set `EXPO_PUBLIC_BUILD_ID` to an immutable release id. Keep
the matching source maps in operator-controlled storage, never in the public app,
the support bundle or a public upload endpoint.

To map a scrubbed stack frame:

1. Read `buildId` from the support bundle.
2. Confirm the deployment and release channel match that build id.
3. Fetch the matching source map from private operator storage.
4. Map only the frame locations already stored in the diagnostic record.
5. Never attach the map or a raw stack to a parent-facing report.

There is no source-map upload API. If the build id is missing, treat the report
as a stale or local build and ask for a fresh export.

## 7. Purge one story's diagnostics

Purge is admin-only, requires an explicit confirmation flag and deletes in
bounded batches until the scope is empty:

```bash
cd frontend
node scripts/diagnostics.mjs purge --story <storyId> --confirm
```

Only diagnostic operations, events and provider receipts for that private story
are removed. The story, chapters, images and EPUB are untouched. Another story's
diagnostics are not affected.

## 8. Retention, quotas and privacy limits

- Detailed server events: 7 days.
- Operation summaries and provider receipts: 30 days.
- Client buffer: 500 events or 256 KiB, in memory only (lost on reload).
- Per-operation detail: 50 events; extra detail stays in console output.
- Deployment defaults: 50,000 stored events, 10,000 summaries, 16 MiB of
  diagnostic detail. Override with `DIAGNOSTIC_MAX_STORED_EVENTS`,
  `DIAGNOSTIC_MAX_STORED_OPERATIONS` and `DIAGNOSTIC_MAX_STORED_BYTES`.
- When the budget is reached, detail is dropped and `quota.dropped` increases;
  console JSON remains the fallback. The budget applies to failures too.
- Routine successes stay in console JSON; durable detail is failure-focused, so
  there is no sampling pass to tune yet.
- No automatic upload and no public trace route.

`convex/crons.ts` runs `diagnostics:cleanupExpired` daily in bounded batches and
reschedules itself while a batch is full. `health` reports expired rows still
waiting for cleanup and the current quota counters.
