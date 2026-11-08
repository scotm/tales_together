# Workshop SVG masters

Each curated choice has an editable SVG on a 300 × 300 canvas:

- `characters/`: 16 character bases.
- `outfits/`: 16 transparent outfit layers.
- `quirks/`: 16 separate quirk icons.
- `world-items/`: four settings, four problems and six backpack items.

Keep character and outfit origins/scales identical. The app composes those
layers; a quirk icon sits in its own badge. Titles identify the artwork, while
the app supplies accessible labels from Convex. Simplified vector previews do
not replace the canonical prompt descriptions used for book illustrations.

Run `npm run workshop:assets` from `frontend/` to generate portable PNGs, the
Metro asset manifest, the hero seed fixture and all review sheets. The existing
local resvg dependency performs the conversion; no runtime SVG dependency is
needed on web, iOS or Android. New remote catalogue art can use a Storage-backed
raster preview while its editable SVG remains here.

See the [catalogue runbook](../../workshop-catalogue-runbook.md) for publication,
migration, revision safety and the full pairing review process.
