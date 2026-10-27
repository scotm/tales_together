# Cover Image Designs — `generate_cover_image`

Three charming, slightly ridiculous cover designs for Tales Together books. Each one is a complete
1600 × 2400 (2:3) SVG with Google Fonts, hand-drawn placeholder art of Barnaby Whiskers, and
`id="slot-*"` hooks so the backend can fill in a real title, author, silly blurb and hero illustration.

The same SVG is used in two places:

| Where | How it's rendered | Fonts |
|---|---|---|
| **In-app "Publishing Ceremony" picker** (`CoverPicker.tsx`) | Inline `<svg>` via SVGR, 3D-tilting books on a shelf | Google Fonts `@import` inside the SVG `<style>` |
| **EPUB `images/cover.jpg`** (`generate_cover_image.py`) | Filled with lxml → rasterised by `resvg` → JPEG | Local TTFs in `fonts/` (resvg ignores `@import`) |

```
design/cover_image/
├── README.md                     ← you are here
├── option-a-penny-dreadful.svg   ← Option A art + template
├── option-b-sticker-pop.svg      ← Option B art + template
├── option-c-midnight-atlas.svg   ← Option C art + template
├── CoverPicker.tsx               ← the picker screen (React/Tailwind/Framer Motion)
├── tailwind.cover-tokens.js      ← palettes, font families, one Google Fonts <link>
├── generate_cover_image.py       ← fill + rasterise + Celery task body
├── nano_banana_prompts.md        ← AI-painted alternative art track (Gemini Image)
└── fonts/                        ← (download, see "Fonts" below) OFL TTFs for resvg + EPUB
```

---

## The three options

### Option A — **The Penny Dreadful Deluxe**
> *"Terribly old-fashioned. Astonishingly dramatic."*

A Victorian chapbook poster. Parchment with paper grain, double-rule frame with fleuron corners,
a sunburst behind an oval cameo containing a **woodcut-style ink otter** (hatching patterns for
shading), an oxblood ribbon banner for the subtitle, a rubber-stamped disclaimer, and a wax seal
embossed with the author's initial.

* **Fonts:** [Rye](https://fonts.google.com/specimen/Rye) (display) · [Fraunces](https://fonts.google.com/specimen/Fraunces) italic (sub-heads) · [Lexend](https://fonts.google.com/specimen/Lexend) (stamp/imprint)
* **Palette:** parchment `#F3E7CF` · ink `#1F1A17` · oxblood `#8E2A2A` · gilt `#B8893A`
* **Ridiculous bits:** "THE ASTONISHING ADVENTURES OF", "Being a True & Faithful Account, in Five Chapters", stamp "CONTAINS 100% GENUINE IMAGINATION / NO DRAGONS WERE HARMED", imprint "PUBLISHED BY LEO PRESS · FIRST EDITION · MMXXVI".
* **Reads well on e-ink.** The static Kindle/Kobo export should default to this if the child hasn't picked.

### Option B — **Sticker Bomb Saturday**
> *"Loud. Shiny. Absolutely covered in stickers."*

Cereal-box pop. Electric-blue halftone with burst rays, a lemon diagonal band carrying the
subtitle, a thick-outlined **cartoon Barnaby** (crooked chef hat, polka-dot apron, golden whisk
with sparkles, rainbow hiccup bubbles), a winged runaway cake wearing a tiny crown, a "WHOOSH!"
speech bubble, and peel-off stickers ("NEW!", "100% KID-DIRECTED", "WARNING: MAY CAUSE GIGGLES").

* **Fonts:** [Bangers](https://fonts.google.com/specimen/Bangers) (display, with `paint-order: stroke` outlines and hard drop shadow) · [Fredoka](https://fonts.google.com/specimen/Fredoka) (stickers/author)
* **Palette:** blue `#2563EB` · lemon `#FDE047` · pink `#EC4899` · orange `#F97316` · mint `#4ADE80` · ink `#111111`
* **Ridiculous bits:** every sticker. The author pill is rotated 3° on purpose, like a child stuck it on.

### Option C — **The Midnight Bedtime Atlas**
> *"Hush. Your hero is up there, in the stars."*

A cosy star chart for Calm Bedtime Mode. Indigo-to-plum gradient, masked crescent moon with glow,
and the hero drawn as a **constellation** — gold star vertices joined by thin lines, with a faint
silhouette hint so a five-year-old can still see the otter. The runaway cake and golden whisk are
neighbouring constellations with tiny italic labels. A lit cottage sits in the hills with a
dotted trail up into the sky; a compass rose points north.

* **Fonts:** [Yeseva One](https://fonts.google.com/specimen/Yeseva+One) (display) · [Nunito](https://fonts.google.com/specimen/Nunito) (labels, italic light subtitle)
* **Palette:** navy `#050A26` · indigo `#151A4F` · plum `#3B1D5E` · gold `#F5D77A` · lavender `#C7B8FF`
* **Ridiculous bits:** "Lutra Minor · The Lesser Otter", "CERTIFIED BY THE MINISTRY OF BEDTIME / Approx. one yawn per chapter · results may vary", "Charted by Leo, age 7".

---

## Slot contract (shared by all three SVGs)

| `id` | Element | Filled with |
|---|---|---|
| `slot-title-1` | `<text>` | Hero name (A/B: first half, uppercase; C: full name) |
| `slot-title-2` | `<text>` | Hero name second half (A/B only) |
| `slot-subtitle` | `<text>` | The "…& the Runaway Royal Cake" part |
| `slot-author` | `<text>` | "LEO, AGE 7" / "by Leo, age 7" / "Charted by Leo, age 7" |
| `slot-blurb-1`, `slot-blurb-2` | `<text>` | The child's chosen silly blurb (two lines) |
| `slot-seal-initial` | `<text>` | Author's first initial (A only) |
| `slot-imprint` | `<text>` | Tiny publisher line (A/B) |
| `slot-hero` | `<image display="none">` | Real illustration (chapter-1 art or character sheet); clipped to the design's window |
| `slot-hero-placeholder` | `<g>` | Built-in SVG otter; **removed** when `slot-hero` is populated |

`generate_cover_image.py` fills these with lxml rather than Jinja so the SVG files stay valid and
previewable in a browser as-is. Long titles are shrunk (never grown) by `fit_font_size()` using a
per-font average character width.

Hero windows: A = oval cameo (720 × 800), B = rounded rect (740 × 800), C = circular porthole (860 ⌀).
Illustrations are `preserveAspectRatio="xMidYMid slice"` so any aspect ratio works.

---

## Backend wiring

Adds to `Story` (docs/02):

```python
class CoverDesign(models.TextChoices):
    PENNY_DREADFUL = "penny_dreadful", "The Penny Dreadful Deluxe"
    STICKER_POP = "sticker_pop", "Sticker Bomb Saturday"
    MIDNIGHT_ATLAS = "midnight_atlas", "The Midnight Bedtime Atlas"
    AI_PAINTED = "ai_painted", "Painted by the Story Robot"   # see nano_banana_prompts.md

cover_design = models.CharField(max_length=32, choices=CoverDesign.choices, default=CoverDesign.STICKER_POP)
cover_blurb = models.JSONField(default=list)        # ["WARNING:", "MAY CAUSE GIGGLES"]
cover_image = models.ImageField(upload_to="covers/", blank=True)
cover_svg = models.FileField(upload_to="covers/", blank=True)   # lossless source
author_display_name = models.CharField(max_length=40)           # "Leo"
author_age = models.PositiveSmallIntegerField(null=True, blank=True)
```

Flow: child taps **Make my book** in `CoverPicker` → `PATCH /stories/{id}/ {cover_design, cover_blurb}`
→ `generate_cover_image.delay(story_id)` → `Epub3Compiler` picks up `story.cover_image` as
`images/cover.jpg` with `properties="cover-image"` (docs/05). The lightweight e-ink export uses
the same JPEG at 1072 px wide.

### Rasteriser

`resvg` (Rust CLI, single binary) handles every feature used here: `feTurbulence`, `feDropShadow`,
masks, patterns, `paint-order`, `clip-path`, data-URI images. Install in the worker image:

```dockerfile
RUN curl -L https://github.com/linebender/resvg/releases/latest/download/resvg-linux-x86_64.tar.gz \
    | tar xz -C /usr/local/bin
```

Fallback (documented in `rasterise_svg`): Playwright + Chromium, which gives pixel-parity with the
browser preview at the cost of a bigger image.

### Fonts

resvg can't fetch Google Fonts; drop the TTFs into `fonts/` (all SIL OFL). Family names must match
the `font-family` strings in the SVGs:

| Family | File(s) from [google/fonts](https://github.com/google/fonts) |
|---|---|
| Rye | `ofl/rye/Rye-Regular.ttf` |
| Fraunces | `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf` + `Fraunces-Italic[...]` |
| Lexend | `ofl/lexend/Lexend[wght].ttf` |
| Bangers | `ofl/bangers/Bangers-Regular.ttf` |
| Fredoka | `ofl/fredoka/Fredoka[wdth,wght].ttf` |
| Yeseva One | `ofl/yesevaone/YesevaOne-Regular.ttf` |
| Nunito | `ofl/nunito/Nunito[wght].ttf` + `Nunito-Italic[wght].ttf` |

The EPUB itself embeds only Lexend + Fraunces (body/display). The cover is a JPEG, so the
cover's fonts don't need to ship inside the book — nice side-effect: no font bloat.

---

## Picker screen (`CoverPicker.tsx`)

* Three books on a wooden shelf, `perspective: 1600px`, Framer Motion spring tilt. Selected book
  lifts off the shelf and gets a thick coloured ring in its own palette.
* Chunky push-button vocabulary from the rest of the app (`border-b-[6px] active:translate-y-[4px]`).
* 🎲 **Spin the Silly Blurb** cycles the ridiculous disclaimer per design; the chosen pair is what gets
  printed. 🔊 reads the cover name + blurb aloud. Haptics on pick (`medium`) and confirm (`heavy`).
* **Calm Bedtime Mode**: shelf goes `bg-slate-950`, A and B dim to 45 %, the Atlas stays bright.
* Accessibility: `role="radiogroup"` / `role="radio"`, visible focus ring, every book has an
  `aria-label` with name + tagline.

Tokens for all of the above are in `tailwind.cover-tokens.js`.

---

## Previewing

Open any `option-*.svg` directly in a browser (fonts load from Google). To test the fill pipeline:

```bash
pip install lxml pillow
python design/cover_image/generate_cover_image.py sticker_pop   # writes preview_sticker_pop.jpg
```

---

## AI-painted covers (fourth track)

The three SVGs are deterministic and free. For a "wow" option, `nano_banana_prompts.md` describes
prompting Gemini's image model (Nano Banana) with the character sheet as a reference, generating
**art only, no text**, and compositing typography via a text-only variant of the SVG templates.
Typography stays crisp and editable; the robot only paints.
