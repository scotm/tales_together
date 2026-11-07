# Diagnostics runbook

Status: D0–D2 implemented 2026-11-07. D3 retention/quotas and D4 reconciliation
remain planned. The app has no operator login: inspection stays on the CLI.

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
node scripts/diagnostics.mjs trace <operationId>
```

Add `--prod` for the hosted deployment. The script wraps
`npx convex run diagnostics:trace` / `diagnostics:recent`; both are internal
queries with bounded reads (one operation, 100 events, 25 summaries).

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
- Unknown charges stay unknown. Diagnostics never estimate a price as actual.

## 4. Console and platform logs

```bash
cd frontend
npx convex logs --history 50 --success
docker compose logs --tail 100 backend
```

Console lines are JSON under the `diagnostics` key. Raw platform logs may
contain historical unsanitized data and must be inspected before sharing.

## 5. Deployment/build mismatch

Compare the bundle's `buildId` and `effectiveOrigin` with the deployment being
investigated. A stale web bundle can keep calling an old origin after a deploy;
reload the page or rebuild before blaming the backend.

## 6. Retention and privacy limits

- Detailed server events: 7 days.
- Operation summaries: 30 days.
- Client buffer: 500 events or 256 KiB, in memory only (lost on reload).
- Per-operation detail: 50 events; extra detail stays in console output.
- No automatic upload and no public trace route.

`convex/crons.ts` runs `diagnostics:cleanupExpired` daily in bounded batches and
reschedules itself while a batch is full. There is no admin purge by story scope
yet; D3 adds that and deployment-wide quotas.
