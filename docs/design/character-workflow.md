# Character creation — Storybook Workshop

The latest sixteen-option shelves and interactive review are documented in
`scroll-and-shuffle.md`. This file records the earlier four-option study and
the shared character → outfit → quirk → name sequence.

Exploratory design, 2026-11-08. Page `02 · Create your hero` in
`storybook-workshop.figcraft`; exports `exports/hero-desktop-{1..4}.png` and
`exports/hero-phone-{1..4}.png`. The Kid Explorer branch uses
`exports/kid-desktop-{1..4}.png` and `exports/kid-phone-{1..4}.png`.
`exports/hero-review.html` is a frame viewer.

## The flow

World → **Character → Outfit → Quirk → Name** → Backpack.

Each screen asks one question and keeps the hero visible. Desktop has a large
portrait and a two-by-two choice tray; phone has a compact persistent hero card
above the same four choices. Naming comes last, once the child has someone to
name. The final screen recaps the character, outfit and quirk before packing.

The hero is unnamed until the final step. Earlier previews identify the
character type, such as `River otter` or `Kid explorer`, and only show the
outfit and quirk once the child reaches those choices. The name field starts
empty. There is no prefilled or silently assigned character name.

Selecting Kid Explorer reveals `Gender · optional` during character selection,
before choosing an outfit. The choices are Girl, Boy, Non-binary and Leave open.
Leave open is the default; a child can continue without specifying gender.
The setting describes the fictional character and is not a question about the
child's personal identity. It does not restrict outfits, quirks or names or
automatically change appearance. The Kid Explorer frames carry that character
through the later steps; their sample gender remains Leave open.

Tabs, Back and Next connect the four example states in FigCraft. Clicking Kid
Explorer on the first screen opens its branch; the River otter tile returns to
the otter branch. World and Hero are connected in both directions. `Pack their
bag` is the boundary of this design; a backpack screen has not yet been created.
It is shown inactive while the name is empty. Gender chips and remaining choice
tiles are static design examples, not a working form or a functional preview.
All characters, outfits and quirk icons are original editable shapes.

## Proposed behaviour when implemented

- Select exactly one character, one outfit and one quirk. Tap a tile to select
  it; use a border, check mark and accessibility state to identify selection.
  Keep the remaining choices when changing any one category.
- Update the preview immediately from local assets. Changing setup choices
  should not make model calls. The final story artwork remains a separate
  illustration step using the chosen character description.
- Preserve the draft when moving backwards, using tabs or returning to World.
  Progress colours indicate position in this flow, not a server save status.
- Initialise the name as an empty string, replacing the current app's seeded
  `Barnaby` value. Only show a name once the child enters it in the final step;
  if they then go back, preserve that explicitly entered name. Trim it on
  submission. Keep packing inactive while it is blank, with the helper
  `Choose a name, then pack their bag.` If submission is attempted through
  another route, retain the draft, focus the field and say `Give your hero a
  name to keep going.` This is proposed behaviour, not current app behaviour.
- Keep Kid Explorer's gender optional and preserve the choice when revisiting
  the step. Leave open contributes no gender assumption to the story prompt.
  Do not infer gender from the name, illustration, outfit or quirk. The current
  app has no explicit gender field; implementation must carry the optional
  fictional-character setting into its character description and generation
  prompt. Do not apply it to the animal or robot choices.
- On phones, scroll the name input and its error above the keyboard. Keep the
  action reachable with the keyboard open and respect device safe areas. The
  mockups show the keyboard closed and require a device check when implemented.
- Expose tiles as radio choices with labels and selected state. Use at least
  44px targets, visible keyboard focus, and avoid moving focus as the preview
  changes. Announce a concise selection summary instead of the whole portrait.

## Mapping to the current app

The source of the choices is `frontend/convex/catalog.ts`. Display labels may
be shorter than the catalogue; identifiers and prompt fragments stay intact:

| Display | Existing catalogue entry |
| --- | --- |
| River otter | `hero_otter` · Scruffy River Otter |
| Little badger | `hero_badger` · Grumpy Little Badger |
| Clockwork robot | `hero_robot` · Rusty Clockwork Robot |
| Kid explorer | `hero_kid` · Brave Kid Explorer |
| Little chef | `out_chef` · Crooked Chef Hat & Apron |
| Detective | `out_detective` · Oversized Detective Coat |
| Cardboard spacesuit | `out_space` |
| Dino pyjamas | `out_pyjamas` · Dinosaur Pyjamas |

The four quirks map directly to the existing `QUIRK_STICKERS`. Hero name maps
to `heroName`; character and outfit still compose `visualDescription`; the
quirk still supplies `protagonistQuirk`. Kid Explorer's optional gender is a
new proposed input, not an existing catalogue option. The author's name is
separate and does not belong to this character workflow.

No app code or schema changes are included in this exploration. The preview
art demonstrates a visual style; a production asset set would need to cover
every character/outfit pairing rather than only the illustrated examples.
