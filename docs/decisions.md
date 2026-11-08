# Decisions & gotchas

Append-only log for choices that took real research, and the sharp edges that came with them.
Newest first. Keep entries short. Mark stale entries `superseded` instead of deleting them.

Template:

```
## <title> — <proposed|accepted|superseded>, YYYY-MM-DD
Decision:
Why:
Gotchas (verified where?):
Revisit when:
```

`AGENTS.md` says how to work in the repo today. This file says why, and what hurt.

---

## iPad browser testing over LAN — accepted, 2026-11-07

**Decision:** `npm run web:lan` detects the Mac's LAN IPv4 address, starts the
existing Docker services with matching Convex public origins, and starts Expo in
LAN mode on port 8081. `LAN_HOST` overrides detection when several adapters exist.
The script supplies public client URLs through process environment overrides;
the ignored `.env.local` file is never edited.

**Gotcha:** binding Expo to all interfaces is only half the setup. Convex must
also advertise its LAN address through `CONVEX_CLOUD_ORIGIN` and
`CONVEX_SITE_ORIGIN`, or storage URLs point at the iPad's own loopback interface.
The CLI can keep its existing local admin URL. A later plain `docker compose up`
can restore loopback public origins; use `web:lan` again for device testing.

**Verification:** Expo listens on `*:8081`; the app responds over the Mac's LAN
address. The served bundle contains the LAN Convex URL, and existing cover/EPUB
URLs use the LAN address and respond successfully. Safari on the physical iPad
can reach `/version` (which returns `unknown`), but the user reported a stuck
Recent stories spinner. A fresh desktop browser also successfully subscribes to
`stories:listRecent` over the LAN WebSocket. The iPad-specific cause is not yet
confirmed. Web development now replaces a configured loopback backend hostname
with the browser's hostname. The home screen shows a connection timeout after
ten seconds, the actual backend URL, and a reconnect control that preserves form
state and refuses to discard pending writes. Browser console timeout warnings
include connection state without story contents.

## Discounted images through Surplus — accepted, 2026-11-07

**Decision:** the local dev deployment now selects `IMAGE_PROVIDER=surplus`,
`SURPLUS_IMAGE_MODEL=gemini-2.5-flash-image` and `SURPLUS_MIN_DISCOUNT_PCT=50`.
Fresh deployments still default to direct Gemini unless explicitly configured.
The Surplus key stays in Convex environment variables. Text generation is unchanged.
Setting `IMAGE_PROVIDER=disabled` skips new art and still exports the readable book.

**Contract:** `POST https://api.surplusintelligence.ai/min50/v1/images/generations`,
Bearer auth, one image, `response_format=b64_json`. Chapters request `1024x768`;
covers request `1024x1536`. PNG/JPEG bytes are detected and normalized to JPEG by
`recompressImage` in the Node runtime. Shared bounded provider retries apply;
402 (funding) and 404 (discount/availability) stop immediately. No automatic paid
fallback between vendors. Existing stored artwork is reused.

**Measured, not advertised:** API samples went through Convex storage/compression.
The response cost headers were verified against each `/v1/requests/{id}` record:

| Sample | Request | Charge (USD) | Generation time |
| :--- | :--- | ---: | ---: |
| Landscape | `01M6TMV9VXSSNRY5HT19YC4Y3W` | $0.000053 | 7.94 s |
| Portrait | `01M6TMV9Z5X2RCA0R99F1D6HBJ` | $0.000105 | 7.11 s |

Both records identify `provider=google`, `route_source=marketplace`,
`fallback_used=false`, `settlement_status=accrued`, `settlement_group=settled`,
`settlement_basis=derived_artifact`. Five landscapes plus one portrait project to
$0.000370 at those sample rates. Direct Gemini 3.1 Flash Image lists $0.067 per 1K
output, or $0.402 for six images before prompt input. The comparison includes a
model change (3.1 → 2.5), not just a different seller. It is a snapshot, not a fixed
future tariff, and excludes retries. The 50% gate compares Surplus's reference
estimate, not Google's actual image-output tariff; final charges can differ.

`npm run check` passes: 12 UI/delivery tests and 112 backend cases, including the
Surplus wire contract, discount/funding refusals, no paid vendor fallback, PNG
conversion/alpha flattening and image-disabled export. Code and generated API
types were pushed to the local backend before the live samples.

**Rejected routes:** Z-Image returned $0.005–$0.008 images, but landscape output
still carried a Venice watermark with `hide_watermark=true`. Seedream and FLUX
requests failed minimum-discount eligibility despite cheaper offers in the public
listing; Venice Nano Banana 2 had no healthy seller. Do not equate the public
order-book price with an executable buyer quote or silently loosen the key's floor.
The optional Z-Image flag is retained as a best-effort upstream request, not a
guarantee of unbranded art.

**Quality limits:** Gemini 2.5 samples preserve the requested raincoat/boots and
storybook style, with a different visual interpretation. The landscape still
invented a small signature-like mark despite the negative prompt. This is a dev
cost setting, not a completed character-consistency or family playtest evaluation.

**Gotchas:** Convex V8's `process.env` cannot be copied with object spread to obtain
the key; the sample action reads each relevant variable explicitly. `pngjs` imports
Node built-ins, so its helper also needs `"use node"` even when called only by a Node
action. Missing cost headers remain unknown, never zero. Request ids are retained
by the CLI sampler for receipt checks; the full per-story spend ledger is still pending.

Sources: [Surplus image API](https://www.surplusintelligence.ai/docs/api-reference/image-generations),
[minimum-discount semantics](https://www.surplusintelligence.ai/docs/marketplace/minimum-discount-routing),
[cost telemetry and receipts](https://www.surplusintelligence.ai/docs/marketplace/routing-controls),
[Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-image).

**Revisit when:** settled prices or availability change, fake signatures affect a
book, or a larger quality evaluation favours another model. A per-story spend cap
is separate unfinished work; a percentage discount is not a budget limit.

## Provider retries, recovery and book delivery — accepted, 2026-11-07

**Decision:** text (Gemini and local OpenAI-compatible) and image requests share a
bounded HTTP retry layer. Four attempts total; 60 seconds per attempt including body
reading; equal jitter over exponential 1, 2 and 4 second delay ceilings. Retry connection
failures, timeouts and HTTP 408/429/500/502/503/504. Authentication, invalid requests,
blocked/empty output, malformed JSON, schema validation and moderation do not auto-retry.
Honour `Retry-After` seconds or HTTP dates; if it exceeds 30 seconds, stop rather than
retrying early or holding an action open indefinitely. Error messages exclude provider
response bodies, prompts, URLs and credentials.

**Recovery:** writing claims an atomic attempt token, persists retry progress, and catches
all failures after the claim, including missing configuration. Failure returns the chapter
to `DIRECTING` with the chosen card and a saved error. An optional expansion failure keeps
the valid first draft. Saving prose and scheduling extraction commit in one mutation.
A 15-minute scheduled watchdog also releases crashed/terminated attempts. Tokens prevent
late responses or old watchdogs from overwriting a newer attempt. Legacy `WRITING` rows
without an attempt token can be retried directly.

**Delivery:** export has persisted cover/build/ready/failed stages, progress, warnings and
retry controls. Repeated requests share one active job; export also has a 15-minute crash
watchdog. Cover failure still exports the readable book and offers a cover retry. Web
downloads a named blob. Native downloads a temporary local EPUB with `expo-file-system`,
opens `expo-sharing` with the EPUB MIME type/UTI, and cleans up the cache directory.
Saving/sharing failures keep the server-side book available for another attempt.

**Verification:** deterministic network tests cover backoff, jitter, `Retry-After`, hung
requests/body reads, permanent errors and exhaustion. Backend tests cover recovery, stale
workers, duplicate export requests and coverless fallback. UI and file-delivery tests cover
reloaded progress/errors, retry controls, real file URIs and cleanup. Native sharing still
needs a real-device check; bundle compilation cannot verify the operating system's sheet.
`npm run check` passes (12 UI/delivery tests, 91 backend cases), and web/iOS/Android
exports all compile. A live local export reused the existing cover, reached `READY`,
and served an EPUB with working download CORS; no paid provider calls were made.

Expo Router includes every file under `src/app` in native route discovery. The story
screen test now lives in `src/__tests__/story.test.tsx`; leaving it beside the route
pulled Jest/Testing Library into native bundles and broke compilation.

**Gotchas:** a timed-out request can have succeeded remotely, so transport retries cannot
promise exactly-once billing. Budget/image-cap accounting is still separate unfinished
work. Retries wrap HTTP calls, never storage writes or the entire story action.

**Revisit when:** real usage suggests different timeout/delay limits, or generation should
move entirely behind scheduled jobs instead of a client-awaited writing action.

## Portrait covers and reader verification — accepted, 2026-11-07

**Decision:** request 2:3 portrait, edge-to-edge cover art; keep chapter art 4:3.
The EPUB starts with a dedicated fixed-layout cover page using an SVG image wrapper,
then a separate reflowable title page. Only the cover spine item overrides the layout;
chapter text remains resizable. In-app covers use a portrait frame with `contain`.

**Why:** the iPad screenshots showed a short landscape thumbnail in Apple Books' library
and a cover illustration taking up only the top of a padded title page. Changing chapter
CSS cannot fix the library thumbnail: its shape comes from the cover image itself.

**Verification:** the user confirmed the previous export opens in Apple Books on a real
iPad, and that epubcheck is functional. The rebuilt portrait-cover version of "The Windy
Kite" passes EPUBCheck 5.4.0 with zero errors and zero warnings. `npm run check` passes
(3 UI tests, 60 backend cases), including archive builds with and without a cover and
byte-identical rebuilds a day apart. The revised cover's appearance on iPad and Thorium
remain unverified.

**Gotchas:** existing stored covers remain landscape until explicitly regenerated with
`media:illustrateCover` and `regenerate: true`; rebuilding the EPUB alone cannot change
the image's aspect ratio. Regeneration replaces the cover and schedules a fresh export.
Apple Books can cache the old cover: delete the imported copy and re-import the new file.
Title typography composited into the cover JPEG remains separate work.

Validation also caught an existing metadata warning: a Convex id is not a UUID.
Book identifiers now use `urn:tales-together:<storyId>`. ZIP auto-folder entries are
disabled because JSZip otherwise gives them the current date, breaking reproducibility.

**Revisit when:** the revised export has been re-imported on the iPad, or cover typography
is implemented.

## Application diagnostics — accepted, 2026-11-07

**Decision:** D0–D2 of `docs/07-application-diagnostics-plan.md` are implemented. Shared,
runtime-neutral event definitions and a bounded client ring live in
`frontend/shared/diagnostics/`. Convex keeps `diagnosticOperations` (30-day summaries) and
`diagnosticEvents` (7-day critical transitions); provider attempts, chapter stages, media, export and
watchdogs write through `convex/lib/diagnostics.ts`. The app has a Help → Diagnostics screen with a
local-only timeline, two connection checks and a redacted support bundle. Server inspection stays on
`frontend/scripts/diagnostics.mjs` (internal `diagnostics:trace` / `:recent`).

**Why:** the iPad incident needed to separate HTTP reachability, a live-query stall and a broken
WebSocket. A local buffer records a connection failure without needing the backend it is trying to
reach; Convex summaries keep enough evidence after the console log rotates.

**Gotchas (verified 2026-11-07):**

- Diagnostic writes are optional: every persistence call is bounded and swallowed, so a broken sink
  cannot turn a readable chapter or finished EPUB into a failure. Console JSON remains the detailed
  fallback.
- Scheduled work gets an explicit `diagnosticContext` (trace, operation, parent, run, scheduledAt).
  Process globals do not survive Convex action boundaries.
- `writingRunId`/`exportRunId` remain the authority for stale-worker guards. Diagnostic operation ids
  are derived (`write-<runId>`, `export-<runId>`) and never authorize a state change.
- Only critical events are persisted (failures, warnings, retries, degraded/recovered/superseded
  terminals); routine starts and successful provider results stay in console JSON. The per-operation
  cap is 50 events.
- Client-generated operation ids are labels passed to public actions so a support report can be joined
  to a server trace. They never authorize a state change, and an invalid label is ignored. Server
  trace ids still come from the story.
- A handled cover failure is an `export.degraded` event and a `cover` summary with status `degraded`;
  the EPUB build still reports success.
- Client support bundles strip story/chapter ids and redact private hosts. The on-device panel shows
  the full local origin so a developer can debug it.
- D3 is implemented: paginated trace/recent, `diagnostics:health`, admin purge by story, daily
  bounded retention cleanup and a deployment-wide event/summary/byte quota.
- D4 is implemented: normal-generation receipts, explicit reconciliation by provider request id,
  bounded usage/metrics views and a baseline command. No external notifications are sent; alerts
  remain an operator decision after a real baseline.

**Revisit when:** real incidents show a missing event, retention needs a cleanup job, or provider
spend needs reconciliation rather than sampled receipts.

## Local text model for dev — oMLX + Gemma 4 E4B — accepted, 2026-11-05

**Decision:** `LOCAL_LLM_URL` (plus optional `LOCAL_LLM_API_KEY` and `LOCAL_LLM_MODEL`) points
`getTextProvider` at an OpenAI-compatible server. Unset by default, so Gemini stays in charge;
setting it moves every purpose — prose and structured — to the one small local model.

**Why:** rehearsing the story pipeline against a paid hosted model costs money and a round trip per
run, and `pitchChapter` only needs JSON of the right shape to prove the plumbing.

**Gotchas (oMLX 5005 on the dev Mac, verified 2026-11-05):**

- oMLX binds `127.0.0.1:5005` and requires a bearer key (see `~/.omlx/settings.json`), so the Convex
  Docker backend cannot reach `localhost:5005`; use `http://host.docker.internal:5005/v1`. Verified
  2026-11-05 from inside `tales_together-backend-1`: unkeyed `401`, keyed `200`.
- Model ids are what `/v1/models` returns (`gemma-4-e4b-it-4bit`), not the full
  `mlx-community/…` repo path.
- The 4B model honours `response_format: json_schema` and tolerates the `nullable` keyword the
  beat-card schema uses, but its prose is nonsense. Smoke tests only.
- Setup: `npx convex env set LOCAL_LLM_URL http://host.docker.internal:5005/v1` and
  `npx convex env set LOCAL_LLM_API_KEY …`; `npx convex env remove LOCAL_LLM_URL` restores Gemini.

**Revisit when:** a dev needs local prose worth reading, or CI needs to run without the Mac.

## Image compression + EPUB export — accepted, 2026-11-05

**Decision:** every stored illustration is re-encoded before it is linked, and the finished book is
zipped into an EPUB 3 by a deterministic compiler.

- Compression: `recompressJpeg` in `convex/llm/compressImage.ts`, quality 55, no resize. Runs in a
  Node action (`convex/mediaNode.ts`) because `jpeg-js` needs `Buffer`.
- EPUB: `convex/epub/build.ts` (V8 action) using JSZip, with `convex/epub/templates.ts` for every
  XHTML/OPF string. Scheduled automatically when chapter 5 locks; also callable by hand.

**Why:** provider JPEGs were 1.1–1.3 MB each (7 MB for a book) and an EPUB is just a ZIP, so both
steps are cheap and keep the whole book under 2 MB.

**Gotchas (verified 2026-11-05):**

- `sharp` cannot work in Convex at all: the push sandbox fails with `Could not load the "sharp"
  module using the linux-arm64 runtime` even with the platform packages installed. `jpeg-js` at
  quality 55 gives 216–273 KB per image, ~80% smaller than the provider output.
- `jpeg-js` needs Node's `Buffer`, so compression has to live in a `"use node"` action. JSZip runs
  fine in the V8 runtime; the EPUB builder stays there.
- `ctx.storage.delete` removes the row but not the blob on disk immediately. After recompressing the
  six images the logical store held 1.49 MB while `/convex/data/storage/files` still showed 8.5 MB
  of deleted blobs (reclaimed by backend GC, not by us).
- EPUB byte order verified by unzipping the generated file: `mimetype` is entry 0, `STORE`, exactly
  `application/epub+zip` with no newline; every manifest href exists in the archive and every spine
  idref exists in the manifest (14 items, 6 spine entries).
- A fixed entry date makes rebuilds byte-stable; `dcterms:modified` comes from `story.createdAt`, not
  `Date.now()`.

**Revisit when:** a reader rejects the file (only structural checks were run, not Apple Books), or
vocabulary footnotes / the appendix are wanted.

## Illustrations — Gemini 3.1 Flash Image — accepted, 2026-11-05

**Decision:** one image provider, prompt-only, model pinned in `convex/lib/config.ts` as
`GEMINI_IMAGE_MODEL = gemini-3.1-flash-image`. Chapters get one still each; the story gets a cover
when chapter 5 locks. Both are scheduled background work off the extraction/lock path, and both use
the same key as the text models.

**Why:** the key already exists, so there is no second vendor, bill or SDK; a live 4:3 image came
back in ~5 s at 1200×896, ~1.1 MB JPEG, matching the extractor's prompt with no text in frame.

**Gotchas (verified 2026-11-05 on a full five-chapter book):**

- Request shape is `generateContent` with `generationConfig.imageConfig.aspectRatio`; the image
  arrives base64 in `inlineData`. `responseModalities` is not needed and was ignored when sent.
- Convex's V8 runtime is not guaranteed to expose `atob`/`Buffer`, so `decodeBase64` is local, with a
  unit test. Storing needs a `Uint8Array<ArrayBuffer>`, not `Uint8Array<ArrayBufferLike>`.
- Character drift is visible in colour details: red boots on the cover, yellow boots in chapter 5,
  same raincoat and hair. Prompt-only art holds identity better than expected but not exactly. That
  was the condition for adding reference images later; it is now the first candidate.
- The cover prompt uses the protagonist's `visualDescription`, never their name — the model has no
  memory of who "Mira" is.
- Each illustration is ~10 s wall clock through the CLI (action itself ~5 s), so a five-chapter book
  spends roughly a minute on art after the text is already readable.

**Revisit when:** drift is visible to a child (references, or one art pass with a seed), or image
spend per book needs to count against `BOOK_BUDGET_USD`.

## Five-chapter loop — accepted, 2026-11-05

**Decision:** `chapters.lockChapter` is the only transition that advances the book. It refuses a
chapter with no prose, is idempotent, flips the story to `IN_PROGRESS` on the first lock and
`COMPLETED` on the last, schedules a retry when extraction is not `DONE`, and the extraction action
pre-pitches chapter N+1 so its cards are waiting.

**Why:** one mutation per transition keeps the UI from ever seeing half a page turn, and prefetching
the next cards hides a model call behind reading time.

**Gotchas (verified 2026-11-05 on a full five-chapter run):**

- Scheduled functions must be internal. `pitchChapter` stays public for the client, so the scheduler
  calls a `pitchNextChapter` internal alias over the same body; a public action is not schedulable.
- Word counts across a real book: 442, 274, 384, 294, 390. Only chapter 1 met the 400–550 matrix
  target; the lint checks read quality, not length, so nothing rejected a short chapter.
- Fix in place: the prose prompt now says out loud that a chapter under the range is a failure, and
  `writeChapter` spends exactly one corrective call when the result lands under
  `PROSE_MIN_WORDS = 360`. It keeps the longer of the two if the retry is also short, and never
  blocks the reader. First chapter after the change: 429 words, no retry needed.
- Chapter titles come from extraction, so the reader shows "Chapter 3" until extraction lands.
- Locked chapters stay reachable through the chapter list on the story screen; without it a child
  loses chapter N the moment chapter N+1 becomes active.

**Revisit when:** the single retry is not enough to lift a stubbornly short chapter, or a story grows
past five chapters and per-chapter spend needs a real ledger.

## Chapter extraction — accepted, 2026-11-05

**Decision:** Prompt 4 runs as an `internalAction` scheduled by `writeChapter` the moment prose is
stored. It writes through one `applyExtraction` mutation whose args *are* the contract; a malformed
reply fails the action and leaves `extractionStatus: FAILED` without touching the chapter the child
is reading.

**Why:** chapter N+1 is pitched and written from `summaryBullets`, the resolved backpack and the
unresolved threads — none of which exist until the extractor has run. Art prompts are derived from
prose that never changes again, so they are stored in the same write.

**Gotchas (verified 2026-11-05 on a two-chapter live run):**

- `ctx.scheduler.runAfter` needs an **internal** function. A public `action` is invisible to
  `internal.*` and the scheduler call fails typecheck with a confusing "property does not exist".
- `unresolvedThreads` is replaced by the extractor's full list, never appended. Stated in the prompt
  because the model's instinct is to report only what changed.
- Hallucinated ids are dropped in `parseExtraction`: an unknown `itemsUsed` id must not mark a
  backpack item the child never had, and a `newItems` id that already exists is the model repeating
  itself.
- Flash-Lite wrote chapter 2 at 274 words, under the 400–550 target, and the lint does not check
  length. Word-count drift between chapters is currently unpoliced.

**Revisit when:** chapters read as too short, or extraction failures start showing up in real runs
(there is no retry until the lock step lands in S5).

## Text model — prose on Gemini 3.5 Flash-Lite — accepted, 2026-11-05

**Decision:** `GEMINI_PROSE_MODEL` defaults to `gemini-3.5-flash-lite`, the same model as
`GEMINI_FAST_MODEL`. Prose still selects the provider through `getTextProvider("prose")`, so raising
the prose model later is one env var, no code change.

**Why:** measured on "The Windy Kite" chapter 1 with the real Prompt 3:

| | gemini-3.8-flash | gemini-3.5-flash-lite |
| :--- | :--- | :--- |
| words | 45 (truncated) | 442 |
| thinking tokens | 1533 of a 1600 cap | 0 |
| lint | — | pass |
| wall time | — | 3.6 s |

3.8 Flash spent its whole output budget thinking, so the chapter came back as one paragraph. Nobody
reads the difference in the prose; everybody feels the price.

**Gotchas (verified 2026-11-05):**

- Thinking tokens count against `maxOutputTokens` on Gemini 3.x. Any prose cap sized from word count
  alone can truncate silently; `writeChapter` now asks for 2400.
- The 22-word sentence ceiling invented for `proseLint` was wrong: 3.8 Flash, Flash-Lite and
  gpt-oss-20b each tripped it at 23–24 words on good prose. Raised to 28, which still catches
  runaway sentences.
- The lint splitter must ignore a closing quote between the full stop and the space (`….” Then`),
  or every dialogue-heavy chapter reads as one long sentence. Fixed with a regression test.
- Flash-Lite overshoots the paragraph target (21 blocks vs 6–9) and undershoots dialogue (17–25% vs
  40%) because it puts each spoken line in its own paragraph. Harmless for reading, unmet as spec.

**Revisit when:** chapters read flat in a real playtest, or a child-facing run justifies 3.8's cost.

## Text model — Gemini 3.8 Flash — superseded, 2026-11-05

**Decision:** pin two Gemini model ids in `convex/lib/config.ts`:

- `gemini-3.8-flash` (GA 2026-09-02) for prose and beat cards.
- `gemini-3.5-flash-lite` (GA 2026-07-21) for structured calls, selected with
  `getTextProvider("structured")`.

Both are overridable per deployment with `GEMINI_PROSE_MODEL` / `GEMINI_FAST_MODEL`. Never use
`gemini-flash-latest`: the alias moves, and a book written either side of a move has two voices.

**Why:** 2.5 Flash is now limited to projects that already used it; new projects are pointed at 3.x.
Pinning a version beats an alias for a product whose output is a keepsake.

**Gotchas (from the Gemini API docs on 2026-11-05):**

- Gemini 3.x rejects sampling parameters. Sending `temperature`, `top_p` or `top_k` is an error, not a
  no-op. The adapter no longer sends them anywhere.
- `thinkingBudget` is replaced by the string enum `thinkingLevel: "low" | "medium" | "high"`.
  `minimal` is not supported on 3.8 Flash. Structured calls send `low`; prose leaves the model
  default.
- Reasoning still arrives as a `parts[]` entry with `thought: true` and must be filtered before
  parsing, as recorded in the superseded entry below.
- 3.8 Flash output cap is 65,536 tokens, so the old `maxOutputTokens` truncation problem is gone;
  keep the explicit cap anyway so a runaway reply cannot bill for 64k tokens.

**Verification status:** request-shape tests pass (model id, no sampling params, `thinkingLevel` for
JSON). The live end-to-end call is **pending** — the local Convex backend (Docker) was stopped during
the switch. Rerun `npx convex dev --once`, then pitch a fresh chapter to confirm both model ids.

**Revisit when:** `gemini-3.5-flash-lite` rejects `responseSchema`, or a newer Flash ships and the
prose check in `docs/03` no longer needs the upgrade.

---

## Text model — Gemini — superseded, 2026-10-30

**Decision:** `gemini-2.5-flash` behind the `TextProvider` interface, with structured calls using
`responseSchema`. The Gemini-vs-Anthropic eval in the entry below was **skipped**, not faked: only a
Gemini key exists, so there is nothing to compare against.

**Why:** the plan called for a real eval or an honest skip. A one-armed eval is a rubber stamp.

**Gotchas (verified 2026-10-30 against the live deployment):**

- 2.5 models return internal reasoning as a separate `parts[]` entry with `thought: true`.
  Concatenating every part feeds the reasoning prose into `JSON.parse`.
- Thinking tokens are billed against `maxOutputTokens`, so a structured reply truncates mid-string.
  At `maxOutputTokens: 900` the pitch JSON ended mid-quote. Structured calls now send
  `thinkingConfig: { thinkingBudget: 0 }`; prose keeps the default thinking budget.
- A 3-card pitch takes ~2.4s wall clock including cold start.
- The parse is still defensive: it recovers a JSON object embedded in prose, and drops
  `suggestedItemId` values that are not catalog ids.
- `pitchChapter` is idempotent: an existing `beatCards` array is returned without a provider call,
  so a double tap cannot double-spend.

**Revisit when:** prose at AGES_7_9 reads worse than the docs/03 examples, or an Anthropic key
appears and the two-model eval can actually run.

---



## Docs ported off Django/Jinja/Pydantic — accepted, 2026-10-30

**Decision:** `docs/README.md` and `docs/02`, `03`, `04`, `05` now describe Convex + TypeScript only.
The Django models, Celery tasks, Pydantic schemas, Jinja templates, `pytest` suites and
`/api/...` endpoints are gone from the blueprint. Where the code was the point (compiler, prompts,
state machine) it is rewritten in the language we actually run.

**Why:** `decisions.md` retired Django on 2026-10-27, but the blueprint still told a reader to build
it. A doc that contradicts the repo costs a rewrite of real code, not a doc edit.

**Gotchas:**

- The component sketches in `docs/04` §5–§10 keep Tailwind class strings and `framer-motion` calls.
  They are labelled as behaviour reference, with a conversion table to `StyleSheet` /
  `react-native-reanimated`. Porting them to RNX is deliberately deferred until each screen is built.
- `docs/02` now writes prose with an action that appends paragraphs by mutation; there is no SSE.
  Anything that assumes a server-push channel has to be rethought, not renamed.
- `docs/05` compiles in a Convex action, so CSS and subset fonts ship inside the bundle through a
  generated `assets.ts` (`npm run epub:assets`). Convex actions cannot read the filesystem.
- Video remains post-v0. The doc keeps the pipeline so the templates are not rewritten twice.
- `docs/03`'s readability check is now sentence length + a cliché list, not Flesch-Kincaid. A score
  nobody acts on is decoration.

**Revisit when:** a doc section is older than the code it describes, or someone adds a second
backend language.

---

## Safety, spend, delivery — accepted, 2026-10-27

**Decision:**

- No separate marketing site. One Expo web export; a landing route inside the app.
- Safety: provider moderation on every text and image call, a banned-cliché/unsafe-term lint, and a
  manual spot-check of generated books. Log failures without storing child PII.
- Hard per-story budget, configured in one place. Starting proposal: **$0.50 and 6 images per book**,
  retries included. Exceeding it fails with a clear message; it never silently spends. Tune after ten
  real books.
- Delivery: web downloads a blob; native opens the share sheet (`expo-file-system` + `expo-sharing`).
  No email delivery and no hosted public link in v0.
- Analytics: deliberately none in v0. No consent banner, no third-party tracker.

**Why:** moderation without an audit trail is theatre; a hard cap prevents retry loops from becoming
the dominant cost; a share sheet matches how families already move files.

**Gotchas:**

- Moderation must cover remixes and voice transcripts too, not just first-draft prose.
- Count retries against the budget, and count image retries separately — one flaky provider can eat
  the whole cap.
- "Manual spot-check" needs a defined sample (first book each week) and somewhere to record it, or it
  quietly stops happening.
- iOS share needs a real file URI; blob URLs don't work.
- Anonymous sessions mean a lost device loses the book. Accepted for v0, but it is a product risk, not
  just a technical one.
- No analytics means no usage evidence. If that becomes a problem, prefer cookieless, aggregate-only
  events over a full product-analytics SDK.

**Revisit when:** ten books exist (tune the cap), or someone asks for a shareable book link.

---

## Client stack — Expo (supersedes web-only) — accepted, 2026-10-27

**Decision:** Expo (React Native + Expo Router + React Native Web) for web, iOS and Android. The
Next.js app is replaced, not kept alongside the product UI. Landed 2026-10-27: `frontend/` is Expo,
`backend/` is deleted.

**Why:** a native tablet app is a launch requirement, and the current frontend is only a placeholder.
Committing before UI work avoids porting a finished web UI into React Native.

**Gotchas:**

- Expo web replaces Next: no RSC, no `cacheComponents`/`partialPrefetching`, no `next/font`,
  no App Router. Routing is Expo Router.
- Tailwind 4 does not carry over. Styling becomes NativeWind; verify its current Tailwind version
  support before assuming v4 syntax. `@theme` tokens move into a NativeWind config.
- Expect two test runners: Vitest for `convex/`, `jest-expo` for UI. Don't force React Native through
  Vitest.
- Platform-specific code is normal (`.web.tsx` / `.native.tsx`). Share types, Convex client, state and
  API logic; expect layout, focus/hover, file access and gestures to diverge.
- EPUB download differs: blob link on web, `expo-file-system` + `expo-sharing` on native.
- Haptics and TTS become `expo-haptics` and `expo-speech`; browser fallbacks are silent/no-op.
- Convex has a React Native client, but no Next.js server helpers. Anything that assumed server-side
  rendering moves to the Convex backend.

**Revisit when:** Expo web fails a core reading/typography requirement, or acquisition needs SEO that
a static landing page can't cover.

---

## Publishing v0 — accepted, 2026-10-27

**Decision:**

- One EPUB per book, static illustrations only. No deluxe/e-ink split, no video variant in v0.
- Cover is AI-generated art with **typography composited on top** (title/author are never left to the
  image model). Target 1600×2400 JPEG, same provider as chapter art.
- Gate: `epubcheck` in CI **plus** structural tests (mimetype first and stored, manifest hrefs exist,
  spine idrefs resolve, XML well-formed).
- Reader targets: Apple Books and Calibre/Thorium. Kindle is best-effort until tested.
- Typography: subset Lexend + Fraunces to WOFF2, embed them, ship the OFL licences in the repo.
- Compiler is a Convex Node action using JSZip + templates. No Jinja, no Python.

**Why:** one output keeps the device test matrix to two readers. AI art gives a cohesive cover; the
typographic overlay keeps the title crisp and avoids garbled lettering.

**Gotchas:**

- Deterministic output needs fixed ZIP entry timestamps and explicit ordering; `JSZip` stamps the
  current time by default.
- Signature capture is deferred; v0 uses a typed author name on the title page.
- The existing cover SVGs are still useful as a typography layer even though the art is AI-generated.
- `epubcheck` needs Java in CI. Cache it or the build gets slow.
- Font subsetting is a build step; commit the subset WOFF2 files, not the full families.
- Apple Books cache is aggressive — deleting and re-importing is the reliable test, not reopening.

**Revisit when:** a reader rejects the file, or the cover pipeline produces garbled text.

---

## Domain shape + AI vendors — accepted, 2026-10-27

**Decision:**

- Schema: `stories`, `chapters`, `characters` as tables. Beat cards and the chosen beat are JSON
  snapshots on the chapter — generated output, never edited.
- Backpack items are embedded in the story with **stable IDs minted at creation** (`item_whisk`,
  not `item_1`). The catalog owns the IDs; prompts and `suggestedItemId` share them.
- Character references use **IDs** in modifiers and extractions; names are resolved server-side.
- Fixed **5 chapters** for v0, reading level `AGES_7_9`.
- Text model: one-day eval, Gemini vs Anthropic. Ten golden premises, same rubric, score prose
  quality, constraint adherence, JSON reliability, latency, cost. Pick one primary plus a fallback;
  don't run both in production.
- Illustrations: one provider, prompt-only. The extractor inlines each character's full
  `visual_description`; no reference images in v0. Add references only if drift is visible.

**Why:** the beat cards are ephemeral; normalising them buys nothing. Stable item IDs fix a real bug
in the docs where `suggested_item_id` could never match. Prompt-only art is the cheapest way to learn
whether consistency holds.

**Gotchas:**

- Convex validators replace Pydantic. `docs/02`/`docs/03` model shapes port over, but `Field(...)`
  descriptions become TS validators or prompt text — they are not enforced by the LLM.
- `docs/04`'s seed backpack IDs (`item_1`…) and the catalog IDs (`item_whisk`…) must be reconciled at
  story creation, not patched in the UI.
- The arc function breaks if `total_chapters < 3`: chapter 1 returns the hook role even when it is
  also the finale. Fixed 5 hides this; add a guard before ever making chapter count configurable.
- Still unchosen: the image provider. Pick after the text eval, using six prompts in one style.

**Revisit when:** text eval is done, or the first illustrated chapter shows visible character drift.

---

## Platform + v0 scope — accepted, 2026-10-27

**Decision:**

- Backend is **Convex**. The Django scaffold is retired; no new Django code.
- Local dev runs the self-hosted Convex backend in Docker. Production uses hosted Convex. A
  DigitalOcean self-host is a fallback, not the plan.
- v0 ships **text + one static illustration + EPUB export**. No video, voice wildcard, toy scanning,
  accounts, series bible, or bilingual mode.
- Client is **responsive web only**. No Expo/React Native in v0. This is not because Expo can't
  target web — it can — but because Expo web means React Native Web + Expo Router, replacing the
  Next.js App Router, RSC, Tailwind 4 and CSS-based tactile patterns already scaffolded here.
  **Superseded 2026-10-27 by "Client stack — Expo" above.**
- One reading level: **AGES_7_9**. Fixed 5 chapters.
- v0 is an **anonymous session** behind an unguessable link. No photos, no child PII.

**Why:** removes DRF, Celery, Redis, Postgres, SSE plumbing and the camelCase boundary. Reactive
queries already model chapter status and media readiness. One schema, one language, one deploy.

**Gotchas (verified 2026-10-27):**

- Self-hosted backend is the same code as cloud under the FSL licence, run via the Docker Compose
  guide in `convex-backend/self-hosted`. CLI needs `CONVEX_SELF_HOSTED_URL` and
  `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.local`; leaving them out silently offers cloud login.
- Docker 28 on macOS can reject the admin key over `127.0.0.1`. Use `http://[::1]:3210`.
- Convex actions: 10 min on the Node runtime, 30 min on the Convex runtime, 512 MiB Node. No FFmpeg
  binary — video stays an external service.
- Documents are capped at 1 MiB. Keep chapter prose in its own row(s); never inline media or base64.
- `docs/03` prompts move from Python string assembly to TypeScript. The prose stays the source text;
  only the templates change language.
- Anonymous-link access means anyone with the URL can read a child's story. Acceptable for v0 only.

**Revisit when:** the text→art→EPUB loop is working, or Docker self-hosting blocks the first week
(move local dev to a cloud dev deployment and keep Docker for the launch check).

---

## Async + media processing — proposed, 2026-10-27

**Decision:** not final. Default to Convex actions; add Trigger.dev only when a job needs system
binaries or runs longer than an action allows; use FFmpeg Micro only if we never add a second
binary-dependent job.

**Why:** Convex actions cover LLM calls, video polling and EPUB zipping. FFmpeg needs a real binary,
which Convex does not provide; `resvg` has a wasm build that does run in a Node action (see "Cover
typography + embedded fonts").

**Gotchas — FFmpeg Micro** (verified against https://www.ffmpeg-micro.com/docs on 2026-10-27):

- Not one call. Presigned URL → `PUT` bytes → confirm upload → create transcode → poll → download.
- `fileSize` must be a JSON number on both presigned and confirm calls; confirm must match the
  uploaded filename and byte size.
- Transcode inputs are `gs://<their-bucket>/...` from the upload step. The blog's
  `https://example.com/video.mp4` example is not the documented contract.
- `-filter_complex` is unsupported. Fine for our simple pass.
- Docs only demonstrate `-c:v` and `-crf` in `options`. Verify `-movflags +faststart`,
  `-pix_fmt yuv420p` and `-an` pass through before depending on them.
- Output is a signed download URL. Input links live 24h; copy the result into our storage
  immediately (retention is undocumented; the blog claims 8h).
- Pricing: 1 token per 10s of input, 200 free, $19.99 for 2,500 tokens. A book with 3 short video
  chapters is ~3 tokens.
- Vendor: Octetra LLC, single-founder, no SLA below Enterprise. Keep the call behind one function
  and treat failure as non-fatal — the chapter keeps its still image.
- Privacy: uploaded video leaves our infrastructure. Re-check DPA/subprocessors before commercial
  launch with children's content.

**Gotchas — Trigger.dev** (verified against docs/pricing on 2026-10-27):

- Not a media API. It runs our code; the `ffmpeg()` build extension installs the binary and sets
  `FFMPEG_PATH`/`FFPROBE_PATH`. `fluent-ffmpeg` must be listed under `external` in
  `trigger.config.ts`.
- No maximum run duration; retries, queues, concurrency limits, rollbacks, self-hostable
  (Apache 2.0). This is the main reason to prefer it over a single-purpose media API.
- Pricing: Small 1x is $0.0000338/s plus $0.000025/run; free plan includes $5 credits and 20
  concurrent runs. A 10s transcode is ~$0.0004.
- It has its own Realtime channel. Do **not** wire that in parallel with Convex subscriptions —
  write the result back to Convex and let the UI subscribe there.

**Spike checklist before committing to either:** one real provider clip end-to-end, confirm the MP4
plays in Apple Books and Calibre, measure wall-clock time, and confirm failure falls back to the
static illustration.

**Revisit when:** the first chapter video is actually generated, or a second job needs binaries.

---

## Backend platform — superseded, 2026-10-27

**Decision:** superseded by "Platform + v0 scope" above. Kept for the reasoning.

**Criteria:** Convex wins if the reactive UI (chapter status, media-ready events, streaming prose) is
the hard part and heavy compute can live behind an external API. Django wins if arbitrary binaries,
self-hosting, or a Python-only requirement are non-negotiable.

**Revisit when:** the first real feature (story creation or chapter generation) is about to be
written — not after models and endpoints exist.

---

## Cover typography + embedded fonts — accepted, 2026-11-07

**Decision:**

- Covers are generated as portrait 2:3 art (`aspectRatio: "2:3"`), then title and typed author credit
  are composited on top as SVG → JPEG at 1600×2400. The model still paints no text.
- Rasterisation runs in a `"use node"` action with `@resvg/resvg-wasm` (not the native
  `@resvg/resvg-js`), `jpeg-js`, and the same Fraunces/Lexend faces as the book. The wasm and TTF
  bytes are inlined by `npm run epub:assets`; Convex cannot read the filesystem.
- EPUB 3 embeds subset Lexend/Fraunces WOFF2 with `@font-face`; both files are in the manifest. The
  OFL licences live beside the source fonts in `frontend/assets/fonts/`.
- The title page and `dc:creator` use `story.authorName`, falling back to "A Young Author".

**Why:** the planned cover needed crisp, editable type and a typed credit; leaving the title to the
image model is how you get garbled lettering. `sharp` cannot load in Convex, but the wasm build of
resvg does run in a Node action, so no external rasteriser service is needed.

**Gotchas:**

- The wasm is ~2.5 MB raw / ~1.3 MB gzipped base64 in the bundle. Keep it in the Node bundle only;
  never import `cover/rasterize.ts` from a V8 module.
- Convex Node actions take storage ids, not image bytes (5 MiB argument cap).
- If composition fails, the raw portrait art is stored as the cover so the EPUB still builds.
- Font files are downloaded, not generated: replace `frontend/assets/fonts/` then rerun
  `npm run epub:assets`.

**Revisit when:** a reader rejects the wasm-rendered JPEG, or the model's 1K portrait output is too
soft at 1600 px.
