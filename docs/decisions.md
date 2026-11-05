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

**Why:** Convex actions cover LLM calls, video polling and EPUB zipping. FFmpeg and `resvg`
rasterisation need real binaries, which Convex does not provide.

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
