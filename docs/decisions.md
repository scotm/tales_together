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
