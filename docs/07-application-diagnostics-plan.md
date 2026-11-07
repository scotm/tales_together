# 07 — Application diagnostics plan

Status: D0–D2 implemented 2026-11-07, plus the D3 daily retention cleanup; D3
quotas/purge and D4 remain planned. No external diagnostics collector is
implemented by this document. File references below describe the current code;
new modules, tables and commands are explicitly proposed.

## Outcome

Given an incident, answer these questions without reproducing a family's story:

1. Which app build, deployment and platform were involved?
2. Was the client unable to reach the server, waiting for a query, or waiting for
   backend work? What was the last confirmed successful step?
3. Which operation, background job and provider request failed? Was it retried,
   recovered by a watchdog, superseded, or deliberately allowed to degrade?
4. How long did each stage take? What usage and charges were actually reported?
5. What can the parent safely do next, and what evidence can they share?

The iPad Recent stories incident is the first acceptance scenario. HTTP
`/version` worked, a desktop WebSocket subscription worked, and the iPad query
remained unresolved. Diagnostics must distinguish those observations rather
than infer that an HTTP response proves a working application connection.

## Starting point

| Area | Existing evidence | Gap to close |
| :--- | :--- | :--- |
| Client | Expo/browser console; home-screen connection timeout, backend URL and reconnect control | No persistent local incident timeline, global error capture, build identity or support report |
| Convex | Function logs, dashboard and CLI; Docker service logs | No common event contract or correlation across actions, mutations and scheduled work |
| Writing | `writingRunId`, start time, retry progress, saved error and 15-minute watchdog | Current state replaces history; final and optional expansion catches discard the original cause |
| Extraction and pitching | Chapter state and Convex invocation outcomes | No complete operation timeline; extraction failure details and queue delay are hard to connect to later work |
| Images | Stored image IDs; Surplus metadata available in adapter results and the CLI sampler | Normal media generation does not retain request IDs or reported charges; compression/storage stages are opaque |
| Export | `exportRunId`, persisted stages, warning/error, retry and watchdog | A handled cover failure can appear as a successful action; build failures lose the specific cause |
| Delivery | Web blob download; native download/share and cleanup | No distinction between server export readiness, file fetch, browser handoff and native sharing outcomes |

The implementation stays in Expo and Convex. Start with structured console logs,
bounded Convex records and local support files. An external collector or error
service is a later decision with a measured need, not a prerequisite.

## Event and error contract

Add shared, runtime-neutral TypeScript definitions and validators under a new
`frontend/shared/diagnostics/` directory, importable by both `src/` and `convex/`.
Use a small logger interface with console, test and durable-summary adapters.
Keep Node-only stack processing and native/browser APIs outside shared code.

Use allowlisted, versioned event objects, not arbitrary objects or serialized
exceptions. Proposed fields:

| Group | Fields and rules |
| :--- | :--- |
| Identity | `schemaVersion`, unique `eventId`, event `name`, `level`, `source` (`web`, `ios`, `android`, `convex`, `node`), environment, app/build and deployment identifiers |
| Time | Server/client UTC timestamp, local sequence, elapsed duration; measure durations with a monotonic clock where available. Do not infer cross-device ordering from wall clocks alone |
| Correlation | `traceId` for a workflow, `operationId` for one execution, optional `parentOperationId`, provider `callId`, HTTP `attempt`, and existing domain `runId` where available |
| Outcome | Stage, status (`started`, `succeeded`, `failed`, `degraded`, `skipped`, `superseded`, `recovered`), stable `errorCode`, safe message, elapsed time |
| Provider | Vendor, model, purpose, HTTP status, allowlisted provider request ID, retry decision/delay, timeout classification and reported usage |
| Scope | Story/chapter IDs in private backend records only; route templates and operation names in client reports. Story IDs are access capabilities in v0 |

Begin with event families `connection.*`, `query.*`, `operation.*`,
`provider.attempt.*`, `job.*`, `media.*`, `export.*`, `delivery.*` and
`diagnostics.dropped`. Record transitions, not every render, socket message or
poll. Distinguish one logical provider call from its transport attempts; an
optional prose expansion is a second call, not attempt five of the first call.

Classify errors at the boundary that has reliable context: configuration,
network, timeout, authentication, rate limit, funding, model availability,
provider response, invalid JSON, schema, prose lint, moderation, storage,
compression, archive building, file delivery and internal failure. Example codes:
`CLIENT_QUERY_TIMEOUT`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`,
`PROVIDER_INVALID_JSON`, `IMAGE_COMPRESSION_FAILED`, `EXPORT_BUILD_FAILED`.
Keep retryability separate from the code and record the actual decision.

Capture typed error information before translating it into a friendly UI error.
Do not retain raw `Error.message`, recursive `cause`, provider bodies or stack
arguments by default. For developer stacks, retain only bounded, scrubbed frame
locations; remove local home paths, query strings and embedded content. Unknown
errors receive a generic code and a support reference.

## Correlation and durable history

- Create the workflow trace when a story is created; assign an operation ID to
  each pitch, write, extraction, image, compression, export and delivery action.
  Link extraction and illustration to the writing operation that scheduled them.
- Pass a validated diagnostics context explicitly across scheduled functions,
  `ctx.runAction` and Node compression. Do not depend on process-global context
  surviving Convex boundaries. Client-supplied IDs are untrusted labels.
- Reuse `writingRunId` and `exportRunId` as domain attempt references. Diagnostics
  IDs must never replace their stale-worker guards or authorize a state change.
  A manual retry gets a new operation and a `retryOf` link.
- Do not add random trace/session arguments to shared reactive queries just to
  correlate them. Measure subscriptions locally by query name and subscription
  ID; preserve Convex query sharing and exclude query arguments.
- Propose `diagnosticOperations` for bounded operation summaries and
  `diagnosticEvents` for important transitions. Keep detailed attempt logs in
  JSON console output; persist enough to explain a failure or degraded result
  after the live log has gone. Add a bounded provider-receipt record only when
  implementing the cost work below.
- Index summaries by operation, private story scope and start time; events by
  operation/sequence and expiry. Use pagination and bounded reads throughout.
  Never build an inspector around a full-table `collect()`.
- Use internal mutations/queries for persistence and inspection. In v0 there is
  no operator identity in the application: start with admin CLI access, not a
  public diagnostics route or a secret embedded in the Expo bundle.
- Deduplicate events by event ID. Record authoritative state transitions inside
  their committing mutation where practical; console lines from retried
  mutations are not evidence that a transition committed. A stale completion is
  `superseded`, not a second successful result.
- Diagnostic persistence must not trigger a second provider call or turn a valid
  chapter/export into a failure. Isolate optional diagnostic writes, bound their
  time, and fall back to sanitized console events. Retain existing recovery
  writes as the business-critical path. Document possible gaps when storage or
  the runtime dies; a start without an end is evidence of an incomplete trace,
  not proof of the underlying cause.

## Instrument the backend where information is available

1. **Provider transport — `convex/llm/request.ts`.** Add lifecycle hooks for each
   HTTP attempt, including failure and final exhaustion. Capture status and
   allowlisted request headers before throwing or parsing the body. The current
   `onResponse` runs only after successful JSON decoding, so it cannot explain
   non-2xx or malformed-body failures. Separate header wait, body read and decode
   where measurable. Record the selected backoff and `Retry-After` handling.
   Hook/sink failures must not be mistaken for provider failures or retried.
2. **Adapters — `llm/gemini.ts`, `openai.ts`, `image.ts`, `surplusImage.ts`.** Add
   model/purpose, token counts and finish reason when reported. Distinguish HTTP
   success from blocked, empty or invalid output. Preserve existing bounded retry
   rules and sanitized errors. Configuration errors should name the missing
   setting, never expose its value.
3. **Chapter work — `chapters.ts`.** Record operation start, provider stages,
   validation, commit, failure and recovery for pitch/write/extraction. Record
   optional expansion failure as a degraded success when the first draft is
   kept. Link queued extraction and the next pitch; measure scheduled-to-start
   delay. Record watchdog recovery and stale attempts explicitly. Diagnostics
   must report current recovery gaps rather than silently add new retry rules.
4. **Media — `media.ts`, `mediaNode.ts`.** Trace generation, storage, compression,
   file attachment and cleanup. Include byte counts, format and dimensions;
   exclude pixels, prompts, storage URLs and filenames. Distinguish disabled
   generation, reused artwork, absent prompts and generation failures. A cover
   fallback is a visible warning in the export trace even when the action returns
   normally. Cleanup failure must not hide a successful attachment.
5. **Export — `exportJobs.ts`, `epub/build.ts`.** Trace claim, duplicate request,
   cover stage, archive build, stored file, completion and watchdog. Include
   archive size, asset counts and missing-asset categories. Link the resulting
   artifact to its export operation. Do not log chapter text or generated XHTML.

For every operation, aim for one terminal outcome. Preserve a failed child span
under a degraded parent. Tests must cover late workers, duplicate invocations,
watchdog recovery and a failed diagnostic sink.

## Client diagnostics that work when Convex does not

Add an app-level diagnostics provider alongside `BackendProvider`, with a bounded
in-memory ring buffer. Propose 500 events or 256 KiB, whichever is reached first,
with individual events capped at 4 KiB. Optionally persist the sanitized buffer
locally with a short expiry; storage failure falls back to memory. Recording a
connection failure must never require sending a Convex mutation.

Capture:

- Build/release ID, app version, platform/runtime, coarse OS/browser version,
  route template, page visibility/app lifecycle and supported diagnostic features.
- Configured versus effective backend origin, whether loopback correction was
  applied, WebSocket connection state, first-connect time, reconnect count,
  connection retries and pending action/mutation counts. Show full local origins
  on the device for debugging; redact private hosts in exported reports by default.
- Initial query wait, first result, subscription interruption and recovery for
  Recent stories and the story screen. A delayed initial result and a previously
  loaded cached result going offline are different states.
- User-triggered retry, pending-write protection and reconnect outcome. Record
  action names and timings, not field contents or clickstream analytics.
- Root error-boundary failures, unhandled web promise rejections, and native JS
  errors through supported platform integration. Chain existing handlers. Avoid
  broad console monkey-patching. Native process/OS crashes require a later crash
  SDK decision; a JavaScript boundary does not cover them.
- File fetch, blob creation, browser download handoff, native file creation,
  sharing availability, share-sheet return and cache cleanup. Browser handoff
  does not prove a file was saved; a returned native share call does not prove it
  was imported into Apple Books. Treat cancellation as unknown when the API
  cannot distinguish it.

Offer an on-demand **Check connection** action in an adult-facing diagnostics
panel: verify the backend version endpoint with a short timeout and perform a
read-only application round trip through the actual Convex client. Record each
result separately. Browser `navigator.onLine` is a hint, not a connectivity test;
an HTTP/CORS failure cannot always be distinguished from firewall or DNS failure.
Never claim a paid provider is healthy without making a call, and never make a
paid call as part of a health check. Do not cancel queued writes to run a probe.

## Support workflow and privacy

Add **Help → Diagnostics** reachable on both screens and from the connection
failure state. Keep it outside the child's story-making flow. Show a plain
status summary, build, last successful connection, pending work and recent safe
errors. Provide **Copy summary** and **Save/share diagnostics** using platform
files/clipboard support with a text fallback. Both must work offline.

The versioned JSON support bundle contains the bounded client timeline, capability
checks and opaque operation/support references already available locally. If the
backend is unreachable, say that server evidence is missing. An operator can
join those references to private records through the CLI. The public app must
not gain access to the operator log store.

Exclude secrets, authorization headers, cookies, full URLs/query strings, story
IDs, chapter text, child/hero names, titles, free-text fields, prompts, model
responses, images, exported book files, device identifiers and filesystem paths.
Do not hash story content as a substitute for excluding it. Default to a random
per-launch session ID; no cross-session child tracking. Preview what will be
shared, allow clearing local diagnostics, and require an explicit user action to
export. There is no automatic upload in the initial implementation.

If remote client ingestion is later needed, first design consent, quotas,
rate limits, body bounds and abuse protection. A story ID or support code is not
operator authentication. Never add a public endpoint that can enumerate traces,
read private diagnostics or write arbitrary events to Convex.

## Provider usage and reported costs

Retain available request IDs and usage for normal generation, not just
`imageSamples.ts`. Use integer micro-USD where reported, an explicit currency,
and a basis such as `reported`, `estimated`, `settled` or `unknown`. Missing cost
is unknown, never zero. Preserve per-attempt evidence: a timed-out request may
have incurred a charge even when no response or receipt arrived.

Receipt reconciliation is an explicit admin operation, initially for requests
with known IDs. Store reconciliation time and settlement state without
overwriting the original observation; deduplicate receipts by provider/request
ID. Count each known charge once and show unknown-charge attempts separately.
Do not multiply one successful sample price into an asserted actual book cost.
Budget reservation/enforcement remains separate work; diagnostic totals cannot
prevent overspend by themselves.

## Retention, metrics and operating limits

Initial proposed defaults: seven days for detailed server events, thirty days
for operation summaries/receipts, and 24 hours for any persisted client buffer.
Set a per-operation event cap, field/string bounds and deployment-wide storage
budget before enabling durable detail. Keep errors, terminal outcomes, retry and
watchdog events; sample routine successful detail when needed. Record dropped
event counts. Retention and caps apply to failures as well as successes.

Delete expired rows through scheduled, bounded batches and continue pagination;
test both heavy bursts and repeated cleanup failures. Confirm actual platform
console-log retention separately. Client buffers, exported support files and
external logs are separate copies with different deletion behavior. Provide an
admin purge by private story scope and document these limits.

Derive initial metrics from bounded summaries or incremental rollups: operation
success/degraded/failure rate, p50/p95 durations, provider-attempt latency and
retry rate, queue delay, watchdog recovery, query time-to-first-result,
reconnection outcome, image byte reduction, export and delivery outcomes, known
spend and unknown-spend coverage. Keep provider/model/environment/operation as
bounded dimensions; never use story IDs, request IDs or error messages as metric
labels. Offline client reports do not provide population-wide client metrics.

Establish a baseline before selecting service objectives. Start with admin
summaries for stuck operations, provider auth/funding failures, repeated storage
failures and diagnostic drops. Add notifications only after choosing an operator
destination and thresholds with minimum sample sizes, deduplication and recovery
notices. No external messages are sent as part of this plan.

## Delivery sequence

Each slice should produce reviewable code, focused tests and an updated runbook.
Suggested first milestone is D0–D2: enough to investigate the current class of
failure without committing to an external monitoring stack.

| Slice | Deliverable | Dependency | Exit evidence |
| :--- | :--- | :--- | :--- |
| D0 — Contract and safe errors | Event schemas, IDs, classifier/redactor, JSON console sink, fake sink, build identity | None | Secrets/content sentinel tests; consistent Node/Convex/web contract; sink failure cannot alter provider behavior |
| D1 — Backend timelines | Operation summaries, bounded critical events, provider-attempt hooks, pipeline and watchdog instrumentation, admin trace command | D0 | One injected provider failure reconstructs call → retries → final error → saved recovery state; handled cover failure appears as degraded export |
| D2 — Offline client report | App diagnostics provider, connection/query timings, error boundary, on-demand probes and support bundle | D0; D1 for server joins | iPad user can export a useful report with Convex unreachable; report excludes story capability URLs; reconnect preserves choices and pending writes |
| D3 — Inspection and lifecycle | Admin-only trace/health CLI, pagination, retention jobs, quotas, release/source-map runbook | D1–D2 | Operator joins a support reference to a complete available trace; bounded reads/deletes; no public trace access |
| D4 — Usage and service view | Normal-generation receipts, explicit reconciliation, duration/error rollups and threshold proposal | D1, D3 | Retried and uncertain charges remain distinguishable; cost totals deduplicate receipts; a real baseline identifies worthwhile alerts |

Proposed code locations: `shared/diagnostics/`, `convex/lib/diagnostics.ts`,
`convex/diagnostics.ts` (internal functions), `src/lib/diagnostics/` (platform
sinks/export), and `scripts/diagnostics.mjs` (admin CLI). Add tables only through
`convex/schema.ts`, regenerate the committed Convex API types, and update
`AGENTS.md` when its three-table description changes. Future source-map uploads
must use an operator-controlled channel; do not expose source maps as a support
bundle or introduce a public upload endpoint.

## Verification and runbook

Use fake providers, clocks and sinks. CI must not need keys, live vendor calls or
family data. Run `npm run check` and compile affected web/native targets. Include
these incident drills in automated tests where practical and record the device
checks separately:

- Backend unavailable; HTTP reachable but WebSocket blocked; query unresolved
  despite a connected socket; background/resume; stale bundle/build identity.
- Provider 429 with backoff, request/body timeout, malformed success body,
  configuration failure and diagnostic-hook exception. Preserve retry semantics.
- Writing crash/watchdog, duplicate request and stale completion; optional
  expansion failure; extraction failure; missing/reused/disabled image.
- Cover failure with successful EPUB, compression/storage failure, export crash,
  failed file fetch, unsupported sharing, share return and failed cleanup.
- Oversized/malicious client values, redaction sentinels in nested errors and
  URLs, sink unavailable, buffer overflow, expiry cleanup and denied public reads.

Write `docs/diagnostics-runbook.md` during D1–D3: collect an offline report, obtain
admin logs, find an operation, interpret retries/uncertain charges, check a
deployment/build mismatch, and purge records. Include safe commands for
`npx convex logs --history 50 --success`, the proposed trace CLI, and
`docker compose logs --tail 100 backend`; flag that raw platform logs may contain
historical unsanitized data and require inspection before sharing.

The first real-device exit check is a Safari report from the iPad, with its
effective backend, build ID, HTTP probe and live-query outcome. A simulated
desktop failure does not close that check.
