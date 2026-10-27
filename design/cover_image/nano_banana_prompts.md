# AI-Painted Cover Art — Nano Banana prompts

The hand-built SVG otter is a placeholder and reads a little bear-like. This track replaces the
`slot-hero` artwork (or the whole cover background) with an image-model painting, then overlays
the SVG typography on top. **The model paints; it never sets type.**

Two models, same prompts, three directions each → six candidates to choose from:

| Model | Use for |
|---|---|
| **Nano Banana (Gemini Image, "2.1")** | fast, cheap, good for the per-story production path |
| **Nano Banana Pro** | higher fidelity; good for hero/character sheets and marketing art |

## Shared character bible (prepend to every prompt)

> **Barnaby Whiskers** is a *river otter* — NOT a bear, NOT a mouse. Long, low, sleek body; small rounded
> ears set low on the sides of the head; short broad muzzle with a wide dark nose and long stiff white
> whiskers; bright round black eyes; dense scruffy chestnut-brown fur with a pale cream throat and belly;
> small webbed paws; a long thick tapered tail that is always visible. He wears a white chef's hat
> perched crookedly to one side, and a red apron with white polka dots. He hiccups small rainbow-sheened
> soap bubbles. He is cheerful, brave and a bit clumsy. Age-appropriate for 4–9 year olds, friendly, no
> scary elements.

## Shared negative / layout constraints (append to every prompt)

> No text, no letters, no words, no logos, no watermarks, no captions, no speech bubbles with writing.
> Portrait orientation 2:3. Keep the top ~30 % and bottom ~15 % of the image visually calm (soft
> background only) so a title and author line can be composited later. Single character in focus.
> Clean edges, no frame, no border.

---

## Prompt A — Penny Dreadful Deluxe (woodcut cameo)

```
[character bible]

A Victorian wood-engraving portrait of Barnaby Whiskers, head and shoulders, three-quarter view,
proudly holding a golden whisk like a sceptre. Rendered as a two-tone woodcut: dense black ink
lines and cross-hatching on warm cream parchment, with a single spot colour of oxblood red on the
apron and faint gilt on the whisk. Engraved sunburst rays radiate softly behind him. 19th-century
chapbook illustration, Gustave Doré meets Beatrix Potter, charming and slightly pompous expression.
Fine hatching texture, visible ink grain, slight paper foxing.

[constraints]  Composition: the otter sits inside an implied oval, centred, occupying the middle
50 % of the canvas.
```

## Prompt B — Sticker Bomb Saturday (pop cartoon)

```
[character bible]

A bold, flat cartoon illustration of Barnaby Whiskers mid-leap, full body, chasing a small
three-tier pink-and-yellow royal cake that has sprouted tiny white wings and a gold crown and is
flying away. He waves a sparkling golden whisk; rainbow bubbles trail from his mouth. Thick uniform
black outlines, cel shading with one flat shadow tone, saturated electric-blue halftone-dot
background with white burst rays. Saturday-morning cartoon / cereal-box mascot energy, exaggerated
squash-and-stretch pose, huge grin. Sticker-like, vector-clean, glossy.

[constraints]  Composition: otter in the lower-middle 55 % of the canvas, cake in the upper right
third, big empty blue area at top for a title.
```

## Prompt C — Midnight Bedtime Atlas (painted night sky)

```
[character bible]

A cosy, painterly gouache illustration. Barnaby Whiskers, seen from behind and slightly to the
side, stands on a soft rolling hill at night beside a tiny glowing cottage, holding a small
lantern up with one paw and looking up in wonder at an enormous indigo-to-plum night sky. In the
sky, faint gold constellation lines trace the shape of a three-tier cake among thousands of warm
gold stars. A large crescent moon with a gentle halo. Colours: deep navy, indigo, dusty plum,
warm gold, lavender mist. Textured paper grain, soft edges, dreamy and quiet — a bedtime book
feel like Oliver Jeffers / Jon Klassen.

[constraints]  Composition: horizon in the bottom 25 %, otter small-ish (lower-left third), the
upper 60 % is open sky for the title and subtitle.
```

---

## How the pipeline uses the result

1. Save the PNG as `Story.cover_art_raw`.
2. Run the usual `fill_cover_svg()` with a **text-only** variant of the matching template
   (`option-*-typography-only.svg`, same slots, no placeholder art, transparent background) and
   composite with Pillow: `Image.alpha_composite(ai_art.resize((1600, 2400)), typography_png)`.
3. For designs A/B the AI art can instead be injected straight into `slot-hero` (cameo / rounded
   window) — this keeps the SVG frame, stickers and stamps and only swaps the otter.

## Choosing

Generate 3 × Nano Banana + 3 × Nano Banana Pro from these prompts. Judge on: (1) is it clearly an
otter? (2) tail visible? (3) chef hat crooked, apron polka-dotted? (4) calm space for type?
(5) does it still read at 300 px tall on the shelf?
