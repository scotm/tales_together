# Asset backlog — graphics still needed

Derived from `docs/01`–`docs/05` and scoped by `docs/decisions.md`
(backend = Convex, client = Expo, MVP = text + static illustration + EPUB, ages 7–9, 5 chapters,
no accounts, no video).

Two sources when needed: **acquire** (someone makes it) or **prepare** (draw it here, in FigCraft, or
in code). Story art ships as JPEG in the published book; app UI assets are vector-first (FigCraft
master + exported PNG); the EPUB embeds WOFF2 fonts.

| Column | Meaning |
| :--- | :--- |
| `src` | Where the design doc asks for it |
| `stat` | `have` (exists in repo / ready to ship), `todo-figure` (draw a figure), `todo-image` (produce an image), `todo-text` (write/use a font/text) |

---

## 1. Brand & mascots

| Asset | src | stat |
| :--- | :--- | :--- |
| Wordmark / logo lockup (SVG) | 01, 04 | `todo-figure` |
| App icon (iOS rounded, Android adaptive fg+bg, web favicon) | Expo launch | `todo-figure` |
| Splash / launch image | Expo launch | `todo-figure` |
| Mascot art set: otter + 2–3 poses (idle, waving, sleeping) | 01, hero card | `todo-image` |
| Medallion/vector ornament frame behind the hero portrait | done (ring in `docs/design/story-forge.figcraft`) | `have` |
| Otter medallion rasters | done (`otter-medallion.png`) | `have` — public domain, Nano Banana 2.1 |

## 2. Story content art (model or illustrator)

Chapter art must follow `docs/02` "Self-contained visual description" rule: no text, no speech
bubbles, no labels inside an illustration; it must survive being shown without context.

| Asset | src | count | stat |
| :--- | :--- | :--- | :--- |
| Chapter illustrations `ch_1.jpg` … `ch_5.jpg`, 4:3 watercolour | 02, 05 | 5 per book | `todo-image` |
| Character reference portrait `char_<id>_ref.jpg` (prototype + sidekick) | 05 | 2–3 per book | `todo-image` |
| Story cover `cover.jpg` (single cover, 1600×2400, 2:3) | 02, design/cover_image | 1 per book | `todo-image` |
| Appendix trading-card avatars (crop of `char_*_ref.jpg`) | 05 | 2–3 | `todo-image` |
| Optional hero "toy scan" reference sheet from a child's photo | 01, 04 | 1–3 | `todo-image` |

## 3. App UI kit (FigCraft sketches)

All drawn in code/`FigCraft` with one consistent 24px grid. Exported PNG/SVG for Expo; keep the
master layer group in `docs/design/*.figcraft`, not scattered PNGs.

| Asset | src | stat |
| :--- | :--- | :--- |
| Padlock glyph, locked + unlocked | 01 (slot machine) | `todo-figure` |
| Slot reel face + shutter/roller strip | 01, story-forge frame | `todo-figure` |
| Spin handle / dice / 3-star cluster | 01 | `todo-figure` |
| Giant red microphone glyph + pulsing rings | 01 (voice wildcard) | `todo-figure` |
| Spice rack icons: sun / storm / spooky / chaos / sound / cliffhanger | 01 | `todo-figure` |
| Beat card faces: BOLD ACTION, CLEVER TRICK, SILLY TWIST, KID WILDCARD | 01, 04, 03 | `todo-figure`, 4 unique scenes |
| Backpack pockets: empty / filled / used | 01, 04 | `todo-figure` |
| Conveyor-belt seamless strip (loops) | 04 | `todo-figure` |
| Sticker sheet: peeling die-cut papers, initial 8 quirks | 01, 04 | `todo-figure` |
| Magic wand icon set: funnier / more-talk / describe-more / less-scary | 01, 04, 03 | `todo-figure` |
| Toy-scan camera framing brackets + capture pulse | 01, 04 | `todo-figure` |
| Read-aloud speaker head + waveform hints | 01 | `todo-figure` |
| "Publication / Publishing Ceremony" button state art (gilded edge, seal) | 01, 05 | `todo-figure` |
| Paper/parchment texture for card + story page | 01 (bedtime / story forge) | `todo-figure` |
| Item catalogue icon set — 6 MVP items, ~12 later | 04 | `todo-figure` |
| Reading-level badge Ages 4–6 / 7–9 / 10–12 | 01, 04 | `todo-figure` |
| Small night preamble for story cards (calm, dark, no text) | 01 | `todo-figure` |

## 4. EPUB assets

Only what a static EPUB needs. Fonts must be WOFF2 and OFL so the compiler can embed them.

| Asset | src | stat |
| :--- | :--- | :--- |
| `Lexend-Regular.woff2`, `Lexend-Bold.woff2` | 05 (body / dyslexia mode) | `todo-text` |
| `Fraunces-Bold.woff2` (+ italic) | 05 (display headers) | `todo-text` |
| `OpenDyslexic-Regular.woff2` (optional, for dyslexia mode) | 01, 05 | `todo-text` |
| Storybook border / drop-cap ornament SVG (2 styles, ink + gold) | 05, storybook.css | `todo-figure` |
| Penny Dreadful cover flourishes (already in `design/cover_image/*.svg`) | design/cover_image | `have` |
| Cover SVG pipeline fonts (Rye, Fraunces, Lexend, Bangers, Fredoka, Yeseva One, Nunito TTFs in `design/cover_image/fonts/`) | design/cover_image README | `todo-text` |
| Small "gilded seal" / "stamp" bitmap for bookplate | design/cover_image | `todo-figure` |

## 5. Fonts for Expo + FigCraft

OFL fonts, same families across app and EPUB so screens and book read the same.

| Family | Source | stat |
| :--- | :--- | :--- |
| Source Serif 4 (display) | `~/src/craft-fonts/fonts/source-serif-4` | `have` |
| Poppins (body/UI) | `~/src/craft-fonts/fonts/poppins` | `have` |
| Lexend, Fraunces for EPUB subset | external OFL fetch, subset to WOFF2 | `todo-text` |

## 6. Pipeline notes

- Chapter art and character references need a single provider + prompt contract
  (`docs/02` "Self-contained character descriptions"); illustration prompt templates already live in
  `docs/03`.
- App art must stay trivial to regenerate: keep master `.figcraft` under `docs/design/`, export PNGs
  to `docs/design/exports/`, keep export names stable (`icon-lock.svg`,
  `badge-ages-7-9.svg`, …).
- Cover pipeline (SVG templates + `resvg`) is Python today; port it to TypeScript or run it through a
  job runner once the first story cover is needed — not a graphics asset, but required before it
  ships.

## 7. Not needed for MVP

- Living-video pipeline assets (`poster`, cinemagraph MP4, FFmpeg service, `Living Picture Tickets`).
- Multi-device design variants — one web/desktop frame + one iPhone frame for the same screen is enough.
- Marketing sites, App Store screenshots, ad creative.

## 8. Next batch to sketch in FigCraft (when asked)

1. `Padlock` glyph locked/unlocked.
2. `Slot reel` face (rounded, 64px tall) with shutter strip.
3. `Spin` star cluster and 3-star button.
4. Backdrop pattern for the Story Forge hero card.
5. `Three items` backpack frames: empty, used, reserved.
6. `Bookplate` ribbon + `Director's Choice` seal for EPUB appendix.
