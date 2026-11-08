# Workshop catalogue and artwork

Convex `catalogOptions` owns the available choices. The setup query returns
labels, exact revision references, default flags and image references. Prompt
fragments stay on the server. New stories store resolved snapshots on the story
and protagonist; catalogue changes do not rewrite a book.

## Apply the additive migration

From `frontend/`, using the existing self-hosted deployment configuration:

```sh
npm run workshop:assets
npx convex dev --once
npm run catalog:seed
```

Deploy and seed before enabling the updated frontend. The anonymous free-form
`stories.create` endpoint is now internal; the app submits curated or confirmed
custom references through `stories.createFromSetup`. Refresh older clients.
Existing story reads, chapters, stored media and exports require no rewrite.

The seed inserts 62 missing logical keys: 16 characters, 16 outfits, 16 quirks,
four settings, four problems and six items. Running it again inserts zero rows.
It never overwrites a published revision or revives a withdrawn option. Editing
a seed fixture does **not** update an existing database record; publish a new
revision for that purpose. The hero import/backup is generated from
`design/character-options.json` (relative to this directory) into
`frontend/convex/fixtures/hero-options.json` (relative to the repository).

Optional legacy snapshot backfill, in batches of at most 100 stories:

```sh
npx convex run migrations:backfillSetupChoices '{"paginationOpts":{"cursor":null,"numItems":100},"dryRun":true}'
npx convex run migrations:backfillSetupChoices '{"paginationOpts":{"cursor":null,"numItems":100},"dryRun":false}'
```

Review the dry-run counts before applying. If `isDone` is false, continue with
its `continueCursor` in `paginationOpts.cursor`. For applying a reviewed batch,
use its original input cursor. The function adds snapshots only for exact,
unambiguous original-seed matches. A story's bag also needs three distinct
matching items still marked `IN_BACKPACK`; a changed/used inventory cannot prove
the original selection and is skipped. Hero matching is independent. Existing
snapshots and all generation fields are left intact. Repeating a completed
backfill changes nothing. Legacy records without snapshots remain readable.

## Publish or withdraw choices

`catalog.publish`, `catalog.withdraw` and both migrations are internal Convex
functions. They are available to the authenticated administrative CLI, not the
anonymous app. Do not edit revision content in the dashboard: that bypasses the
versioning and snapshot guarantees.

Example of a new item with a neutral preview:

```sh
npx convex run catalog:publish '{"key":"item_lantern","category":"item","sortOrder":6,"label":"Friendly lantern","displayLabel":"Lantern","promptFragment":"A small lantern with a warm golden glow","isDefault":false,"expectedRevision":0}'
```

For an update, submit the full desired content and the latest
`expectedRevision`; omitted optional artwork/capability fields are cleared in
the new revision. The mutation retires prior active revisions atomically and
rejects stale publication attempts. A key cannot change category. Problems
require `titleSuffix`; only characters support optional gender. Single-choice
categories allow one active `isDefault`; items may have several starter flags.
When no default is flagged, setup uses the first active option in catalogue
order. Bag capacity stays three regardless of catalogue size.

An already selected retired revision stays pinned. The UI explains that a newer
choice exists; selecting its tile explicitly replaces the old revision. Safety
withdrawal is different:

```sh
npx convex run catalog:withdraw '{"optionId":"<catalogOptions document id>"}'
```

A withdrawn revision cannot start a new story. The draft is preserved for
replacement, including removal of an unavailable item from a bag slot. Already
saved books retain their resolved descriptions. Withdrawing one revision does
not withdraw other revisions of its key; withdraw each affected revision when
necessary.

## SVG masters and portable previews

The editable masters are under [`design/assets/`](./design/assets/README.md).
All 62 choices have an SVG. The original 48 hero assets share a
`viewBox="0 0 300 300"`; the 14 setting/problem/item masters use the same canvas.
The detective master now includes its checked coat and brass magnifying glass.
The SVGs are UI previews; the prose/image generation descriptions remain the
preserved catalogue prompt fragments.

`npm run workshop:assets` uses the existing local `@resvg/resvg-wasm` to build
66 portable 600px PNGs (62 catalogue choices and four neutral beat illustrations) in `frontend/assets/workshop/`, a static Metro `require`
manifest in `frontend/src/lib/workshopAssets.ts`, the hero seed fixture and six
review sheets. This adds no rasteriser, SVG runtime or generation request to the
app. Commit the generated PNGs, manifest and fixture with source changes.

Character bases and outfit layers use the same full square at the same scale;
quirks use a separate badge. Never crop an outfit to its visible bounds. Four
[`workshop-pairings-N.png`](./design/exports/workshop-pairings-1.png) sheets cover
all 256 character/outfit pairs. The [quirk](./design/exports/workshop-quirks.png)
and [world/item](./design/exports/workshop-world-items.png) sheets cover the
remaining assets. Regenerate and review them when changing art; do not exclude
combinations to hide placement problems.

For new bundled choices, add the SVG/master entry to the generator's source
manifest and rebuild. For publication without a client release, upload a PNG,
JPEG or WebP preview to Convex Storage and pass its `previewFileId` to
`catalog.publish` (maximum 5 MiB). Keep its SVG master in the design sources.
Storage previews take priority over `assetKey`. Use `previewLayout:"layer"`
only for artwork authored and checked against the shared 300-square coordinate
system; ordinary independent icons should use `previewLayout:"icon"`.
Unknown bundled keys and failed images get a neutral preview with the real
choice label. A remote failure tries the known bundled asset before the neutral
fallback. Never pass an SVG file as the native runtime preview.

## Verified locally, 2026-11-08

The schema/functions were pushed to the configured local deployment. The seed
inserted 62 choices; the public query returned the expected category counts
and no prompt fragments. Backfill dry-run found one exact story and three exact
heroes; applying it added those snapshots, and a repeated dry-run found zero
remaining matches. No generation/provider calls were made.

Automated coverage includes concurrent publication, pinned and withdrawn
revisions, immutable book descriptions, new database-only items, storage
previews, exact-match backfill, explicit gender, expanded shelves, Shuffle,
empty/error recovery, offline caching and image failures. Device keyboard,
VoiceOver/TalkBack, browser focus and responsive visual acceptance still need
manual checks. Custom/spoken ideas and themed chapter/reading/delivery screens are now
implemented; see the [ideas and story-screen runbook](./workshop-ideas-runbook.md).
