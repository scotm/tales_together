# 06 — Build Plan

`docs/01`–`docs/05` are the blueprint. This file turns them into slices of work that each end in
something a parent can see and a test can check. A slice names the doc sections it draws from, but
the code in those sections is reference, not a spec to copy line by line.

## Rules for a slice

- One slice = one branch = one PR. Don't start a slice whose **Needs** column is unmet.
- Definition of done, every time: `npm run check` green, at least one new test for the one branch
  that could silently break, and the docs patched if a field or flow changed shape.
- If a slice picks a vendor or discovers an API sharp edge, add a `decisions.md` entry in the same PR.
- Vendor calls sit behind one interface with a fake implementation, so CI never needs an API key.

## Where the code is today (2026-11-05)

| Have | Missing |
| :--- | :--- |
| `convex/schema.ts` (3 tables), `stories.create` / `get` / `listRecent`, `catalog.ts` | Nothing writes chapters 2–5 yet |
| `llm/` adapter (Gemini + local oMLX), Prompts 2–4, prose lint, full chapter loop, background extraction, `media.ts` illustrations + cover | No EPUB, no video, no re-illustration path |
| Expo home + story screen: deal cards, pick one, write, read paragraphs (chapter title now comes back from extraction) | Setup UI still uses hardcoded values; no download |
| Test runners: `jest-expo` (2 UI tests) + `convex-test` (46 Vitest cases) | Chapters average 357 words vs a 400 target; no eval harness |

## Slices

| # | Slice | Ships | Docs | Needs | Size |
| :- | :--- | :--- | :--- | :--- | :--- |
| S0 | Foundation | Green baseline, provider seam, budget config | 02 §4 | Convex running | S |
| S1 | Toy Box setup | Real story input from the catalog | 01 §1.1, 04 §4–5 | S0 | M |
| S2 | Beat pitcher | 3 plot cards for chapter 1 | 03 §2, §5 | S1 + text model | M |
| S3 | Prose + reader | A readable chapter that writes itself | 03 §3, §6 | S2 | L |
| S4 | Extraction | Continuity, inventory, art prompt | 03 §7, 02 §3 | S3 | M |
| S5 | Five-chapter loop | A finished text-only book | 02 §2, 03 §2 | S4 | M |
| S6 | Illustration + cover | Every chapter has a picture; book has a cover | 02 §5 | S5 + image model | M |
| S7 | EPUB | A file that opens in Apple Books | 05 | S6 | L |
| S8 | Polish | Magic Wand, calm mode, tactile pass | 03 §8, 01 §3 | S7 | S |

S0–S5 reach "a book a child can read" with no image spend. That is the milestone worth protecting:
art and packaging are additive, and if they slip the book still exists.

---

## S0 — Foundation

**Goal:** the seams every later slice plugs into, plus a baseline that is actually green.

- `convex/lib/config.ts`: budget cap, image cap, reading level, chapter count in one place. Nothing
  else hardcodes `5` or `AGES_7_9` (today `stories.ts` does).
- `convex/llm/provider.ts`: `interface TextProvider { complete(req): Promise<string> }` with a
  `fake.ts` recording calls. Real adapters land in S2; the interface lands now so no call site is
  ever written without one.
- `convex/llm/moderation.ts`: `check(text)` wired into the provider wrapper from day one, returning
  pass-through in dev. Retrofitting moderation is how it gets skipped.
- Fix `arcRoleFor` to use `getArcRoleInstructions` (docs/03 §2) so there is one implementation.

**Exit:** `npm run check` green against a real deployment; the existing sample story still creates
and renders; a unit test shows the fake provider records a call.

---

## S1 — Toy Box setup

**Goal:** `stories.create` gets real input instead of `SAMPLE`.

- `src/data/toyBoxCatalog.ts` from docs/04 §4: worlds, problems, archetypes, outfits, quirks, the six
  conveyor items. Catalog ids only (`item_whisk`), never indices.
- Home screen: three reels with padlock toggles, name field, exactly three backpack picks.
- `stories.create` args extended with `artStyle`, `vibe`, and validation that every item id exists in
  the catalog and that exactly three were sent. Client-side checking is a convenience; the mutation
  is the boundary.

**Out of scope:** peel-and-stick physics, drag-and-drop, camera scanning, voice naming.

**Exit:** a story created from non-sample values opens at `/story/[storyId]`; a test proves an
unknown item id is rejected.

---

## S2 — Beat pitcher

**Goal:** chapter 1 has three cards a child can choose between.

- Port Prompt 2 and the matrices from docs/03 into `convex/llm/`; one `jsonSchemas.ts` mirroring the
  Convex validators, with the sync test from docs/02 §4.
- `pitchChapter` action → `chapters.setBeatCards` mutation (validator on args).
- Status moves `PITCHING → DIRECTING` only when three cards are stored.
- One-day text-model eval first (ten golden premises, same rubric) per `decisions.md`; the winner
  becomes the adapter, the loser is not wired in.

**Exit:** with the fake provider, a test asserts three persisted cards and the status change; with
the real provider, one story produces three cards that read like the docs/03 examples.

---

## S3 — Prose + reader

**Goal:** the child presses "Write Chapter!" and reads paragraphs as they land.

- Prompt 3, `generateChapter` action, one internal mutation per finished paragraph, `chapters.
  startWriting`.
- Budget check before the call and increment in the mutation that records the result.
- Prose lint (sentence length + cliché list) before `REVIEWING`.
- Reader screen: paragraphs, chapter number, title; the "painting" placeholder is text-only for now.

**Exit:** a real run lands 400–550 words in the level's sentence range, paragraphs appear without a
refresh, and a banned phrase in a fake response is caught by the lint.

---

## S4 — Extraction

**Goal:** chapter *N+1* knows what happened in chapter *N*.

- Prompt 4, `applyExtraction` internal mutation taking the validator from docs/02 §4.
- Items marked `USED` with `usedInChapter`; `unresolvedThreads` replaced, not appended forever.
- `illustrationPrompt` / `videoMotionPrompt` stored even though nothing renders them yet.
- `extractionStatus` moves `PENDING → RUNNING → DONE | FAILED`; `FAILED` never blocks reading.

**Exit:** an item used twice in prose is still `USED` once; a malformed extraction fails the action
without writing a partial chapter.

---

## S5 — Five-chapter loop

**Goal:** five chapters, start to finish, text only.

- `chapters.lock` mutation + "Next Chapter!" affordance.
- Pitch chapter *N+1* scheduled from the extraction action (`ctx.scheduler`), not from the client.
- Arc guard (≥ 3 chapters) already in the matrix; keep the fixed 5 for v0.
- `stories.status → COMPLETED` when chapter 5 locks.

**Exit:** a Vitest case drives five chapters with the fake provider and asserts order, arc roles and
final status; a manual run reaches chapter 5 without a dead end.

---

## S6 — Illustration + cover

**Goal:** every chapter has a picture and the book has a cover.

- Image provider picked with six prompts in one style (per `decisions.md`), behind the same provider
  interface shape as text.
- `illustrateChapter` action → `_storage` → `illustrationFileId`; reader renders `getUrl` result.
- Cover: AI art with the title composited on top, 1600×2400 JPEG. Never let the model draw the title.
- Image cap counted separately from text spend.

**Exit:** five illustrations plus a cover, and the seventh image request fails with the budget error,
not a silent charge.

---

## S7 — EPUB

**Goal:** `Download book` produces a file that opens in Apple Books and Thorium.

- `convex/epub/` from docs/05: JSZip build, template functions, fixed entry dates, `renderParagraphHtml`
  with its unit tests, `assets.ts` generator for CSS and subset WOFF2.
- Download on web (blob), share sheet on native (`expo-file-system` + `expo-sharing`).
- `epubcheck` in CI, plus the structural tests in docs/05 §10.
- Typed author name on the title page; signature is post-v0.

**Exit:** `epubcheck` clean on a fixture book, byte-identical rebuild, and a manual open on a real
iPad and in Thorium recorded in `decisions.md`.

---

## S8 — Polish

Calm bedtime mode, the tactile pass across both new screens, and the Magic Wand remix (Prompt 5) with
its moderation call. Small enough to fold into S7's tail if review finds it cheaper.

---

## Deliberately not now

Voice wildcard, living video, toy scanning, series bible, bilingual mode, accounts, public book
links. Each is in docs/01 as vision and in `decisions.md` as explicitly cut from v0. Adding any of
them before S7 means the book has no cover and the videos have no readers.

## Unknowns to resolve before they bite

- Text model: the eval in S2 is on the critical path for S3. A week of guessing beats a day of
  measuring.
- Image provider: unchosen until S6, but the *prompt* contract must be identical to docs/03's
  self-contained descriptions, or character drift will look like a bug in the extractor.
- `epubcheck` needs Java in CI. Cache it in S7, not when the build goes red.
- Self-hosted Convex on Docker 28/macOS: admin-key auth may need `http://[::1]:3210` (already in
  `AGENTS.md`).
