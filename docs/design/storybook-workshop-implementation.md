# Storybook Workshop — implementation plan

Prepared 2026-11-08 against the current Expo/Convex app and
[storybook-workshop.figcraft](./storybook-workshop.figcraft). The numbered
sections describe the target implementation; completed work is tracked below.

Revised after product feedback: Convex owns the available choices and each
story's selected values. The shelves offer starting ideas; children can also
describe their own character, outfit, quirk or extra details by speaking or
typing. This supersedes the original source-code catalogue/no-migration plan.

## Implementation progress — 2026-11-08

**W1 foundation is implemented.** The setup route now composes World → Hero →
Backpack, with Character → Outfit → Quirk → Name tabs. A session-scoped reducer
and `SetupProvider` sit outside the backend subtree, preserving choices across
route navigation and backend remounts. Both names start empty; a blank hero name
returns the child to naming. Keep flags, direct world choices, the three-item
starter bag, optional author credit and recent stories remain available.

Shared tokens, bundled Poppins/Source Serif 4 fonts, a safe-area/keyboard-aware
shell, buttons and choice tiles provide the initial workshop presentation.
Font failure or a 2.5-second loading timeout lets the app open. Creation has a
duplicate-request guard and a stable pending view; failures retain the draft,
and successful navigation resets it. Connection recovery preserves cached
recent stories and refuses to discard pending writes. Story queries and
chapter/export/delivery operations are extracted into `useStoryWorkshop`;
the existing story UI and Convex workflow remain in use.

**W2 catalogue/art and the curated W3 creation path are implemented.** Convex
now owns 62 revisioned options. Internal seeding/publishing/withdrawal preserves
stable IDs and prompt fragments; setup pins references rather than silently
switching revisions. `stories.createFromSetup` resolves every reference on the
server and stores immutable world/bag and hero snapshots. The legacy creation
endpoint uses database inventory validation, and the story screen reads item
labels from the saved inventory. There is no source-catalogue runtime fallback.

The shelves now show all 16 characters, 16 outfits and 16 quirks, with category
Shuffle, saved scroll offsets, web radio-grid keys and optional Kid Explorer
gender. New 300-square SVG masters cover all four settings, four problems and
six items alongside the existing 48 hero assets. A repeatable local build makes
62 portable PNGs, the Metro manifest and six review sheets. All 256 seed
character/outfit pairings and all quirk/world/item icons were visually reviewed;
the detective master now has its checked coat and magnifying glass. Storage
previews allow later catalogue art without a client release; unknown/failed art
has a labelled neutral fallback.

The additive schema/functions and seed are deployed locally. The seed inserted
62 rows. An optional exact-match backfill added snapshots to one existing story
and three protagonists; a repeat dry-run found zero remaining matches. It leaves
uncertain selections, used inventories, existing content and all media intact.
See the [catalogue runbook](../workshop-catalogue-runbook.md) for commands,
publishing rules and artwork maintenance.

Verification: the project checks cover 47 frontend/delivery tests and 153 backend
tests; web, iOS and Android exports compile. This includes creation/recovery,
concurrent catalogue publishing, preserved old revisions, withdrawal, immutable
snapshots, new database-only items, storage previews, idempotent backfill,
expanded shelves, Shuffle, explicit gender and image failure fallbacks. No paid
generation calls were made. Device keyboard, browser focus, screen-reader,
sharing and responsive visual acceptance checks remain outstanding.
Custom/spoken ideas and themed chapter/reading/delivery screens are later work.

## 1. Outcome and scope

Replace the current single-page setup form with World → Hero → Backpack, with
Character → Outfit → Quirk → Name inside Hero. Bring the revised paper-theatre
visual language into chapter direction, then carry it through reading and book
delivery without losing the existing recovery controls.

Build on Expo Router, React Native `StyleSheet`, React state and Convex. Keep
the five-chapter, ages 7–9 book, current text/image provider configuration and
static EPUB pipeline. Load the catalogue from Convex; browsing, static previews
and shuffling loaded choices then remain local operations with no generation
calls. Speaking a custom idea adds explicit transcription and interpretation
steps, with editable text and confirmation before applying the result.

Add catalogue records and structured selection snapshots to Convex. Preserve
the existing character `visualDescription` and `quirk` as server-composed
outputs consumed by generation, rather than making the client authoritative
for prompt text. See §5 for the schema, migration and spoken-choice flow.

## 2. What the revised design actually specifies

### Source precedence

Use the latest page for the parts it revises, with these companion sources:

| Source | Implement from it |
| --- | --- |
| Page `01 · Storybook Workshop` | World desktop/phone and chapter-direction desktop |
| Page `03 · Scroll & shuffle` | Latest character, outfit and quirk shelves; replaces page 2's four-option trays |
| Page `02 · Create your hero` | Naming screen and optional Kid Explorer gender; both still apply to the expanded shelves |
| [character-options.json](./character-options.json) | Initial seed of 16 characters, 16 outfits and 16 quirks, with SVG references |
| [scroll-and-shuffle.md](./scroll-and-shuffle.md) | Browse/Shuffle semantics |
| [character-workflow.md](./character-workflow.md) | Name, gender, back navigation and accessibility rules |
| [hero-picker.html](./exports/hero-picker.html) | Local interaction reference, including layered preview and keyboard behaviour |

The file contains three pages, 28 top-level frames and 4,379 nodes. Desktop
workshop screens are 1440 × 1000; phone references are 390px wide with varying
content heights. These are reference compositions, not fixed runtime viewports.
There are no defined design styles or variables to import as an app theme.

Representative references: [world](./exports/workshop-world.png),
[chapter choices](./exports/workshop-chapter.png),
[desktop shelf](./exports/shelf-desktop-character.png),
[phone shelf](./exports/shelf-phone-character.png),
[name](./exports/hero-phone-4.png) and
[optional gender](./exports/kid-desktop-1.png).

### Gaps and corrections to resolve during implementation

- **World selection:** the mockup shows current choices and Keep buttons but
  no direct-selection menu. Preserve the app's ability to choose any setting
  or problem: make the choice body open a labelled option panel, with Keep as
  a separate control. This panel needs a layout using the shared card styles.
- **Incomplete screens:** Backpack, chapter direction on phones, reading,
  completion, recent stories, loading and errors do not have revised frames.
  Their proposed layouts are specified below; do not treat them as approved
  FigCraft compositions. Reuse existing behaviour while applying the theme.
- **Preview alignment:** a fresh export of node `3201` reproduces the latest
  desktop outfit screen's floating hat/apron beside the otter. Correct asset
  placement rather than copying these coordinates. The standalone SVGs and
  HTML composition provide a better starting point, subject to pairing QA.
- **Artwork versus descriptions:** some icons simplify the prompt description
  substantially. For example, the detective icon appears yellow while its
  preserved prompt describes a checkered coat. Review these differences and
  correct UI artwork before promising an exact illustration match. Keep the
  existing prompt fragments intact in the catalogue import.
- **World/card art coverage:** only one world scene and sample beat-card
  scenes are drawn. Do not show a bakery for every setting or a jam jar for
  every clever plan. Additional art or neutral fallbacks are required (§6).
- **Content sizing:** fixed text heights in the design are not layout rules.
  Names, generated pitches, text scaling, optional gender and keyboard display
  must be allowed to increase content height.
- **Open choices:** the revised product direction adds a custom-idea tile,
  recording controls, editable transcript, interpretation/confirmation and
  custom-preview fallback. These have no FigCraft frames yet. The original
  sixteen-choice counts describe the seed catalogue, not a permanent limit.

## 3. Current code and the work it supports

Paths in this table are relative to `frontend/`. This is the pre-workshop
planning baseline; completed replacements are recorded in the progress section.

| Existing code | Current behaviour | Required change |
| --- | --- | --- |
| `src/app/index.tsx` | One setup form, four options per hero category, seeded `Barnaby`, world locks/spin, three-item bag, author credit and recent stories | Extract setup state and focused steps; start name empty; expand catalogue; retain connection recovery and recent stories |
| `src/app/story/[storyId].tsx` | Fetches story; pitches, picks and writes; reads prose; reopens chapters; locks chapters; retries and downloads export | Separate controller from themed direction/reading/completion components |
| `convex/catalog.ts` | Source-code IDs and prompt fragments; four settings, four problems, four per hero category, six items | Move content to seeded Convex catalogue records; keep stable logical IDs and use queries/server resolvers at runtime |
| `convex/stories.ts` | `create` validates three distinct known bag IDs and nonblank title/name, then creates story, protagonist and five chapter rows | Add a structured setup endpoint and shared creation helper; resolve choices and compose descriptions on the server |
| `convex/schema.ts` | Canonical story, character, chapter and recovery/export fields | Add catalogue/custom-idea records and optional selection snapshots on existing records |
| `convex/chapters.ts` | Pitching, saved `chosenBeat`, writing attempt tokens, extraction, lock/advance and recovery | Reuse transitions; do not create a second client workflow authority |
| `convex/media.ts`, `mediaNode.ts`, `cover/`, `epub/`, `exportJobs.ts` | Static art, cover typography, deterministic EPUB, persisted export stages/retries | Retain; UI art is separate from generated book art |
| `src/lib/BackendProvider.tsx`, `diagnostics/` | Connection tracking, reconnect protection for pending requests, diagnostics | Keep mounted; theme the visible status/help surfaces |
| `src/lib/recap.ts`, `loadingPhrases.ts`, `saveBook.*` | Recap cleanup, working copy, platform-specific delivery | Reuse in the new components |

The working app is ahead of several older architecture documents. It stores a
complete prose result after the action returns, not streamed paragraph tokens.
Cover typography and EPUB fonts already work. Budget constants exist, but hard
per-book spend enforcement is unfinished. New speech/interpretation calls need
their own bounded request/quota controls rather than assuming that cap works.
`convex/llm/moderation.ts` currently returns success without inspecting text;
calling that helper alone is not a working custom-input moderation boundary.
See [decisions.md](../decisions.md) for the current operational constraints.

## 4. Client structure and navigation

Keep `/` as setup and `/story/[storyId]` as the persistent story route. Keep
`/diagnostics` reachable from the workshop header/help control. Use local setup
steps initially; each Next/Back operation should not create a story or change
the story URL. Recent stories can be a panel on `/`, opened by its header
button, so opening and closing it preserves an unfinished setup draft.

Suggested new modules, all under `frontend/src/` unless noted:

| Proposed module | Responsibility |
| --- | --- |
| `components/workshop/theme.ts` | Colours, spacing, radii, typography and layout thresholds |
| `components/workshop/WorkshopShell.tsx` | Brand/header, safe areas, content width, help and responsive slots |
| `components/workshop/WorkshopButton.tsx` | Primary, secondary and Shuffle variants; focus, disabled and busy states |
| `components/workshop/ChoiceTile.tsx` | Labelled image, selection border/check and radio state |
| `components/workshop/ChoiceShelf.web.tsx` / `.native.tsx` | Data-driven grid scrolling, selection visibility, custom-idea entry and platform focus/input handling |
| `components/workshop/HeroPreview.tsx` | Layered preset portrait, honest custom-detail fallback and concise text summary |
| `features/setup/SetupProvider.tsx` | Reducer/context for one in-memory setup draft |
| `features/setup/WorldStep.tsx`, `HeroStep.tsx`, `BackpackStep.tsx` | Compose controls, validation and step-specific copy |
| `features/setup/RecentStoriesPanel.tsx` | Existing query, empty/loading/error/cached states and story links |
| `features/story/useStoryWorkshop.ts` | Existing queries/actions, derived active/viewed chapter and pending operations |
| `features/story/ChapterDirector.tsx`, `ChapterReader.tsx`, `BookCompletion.tsx` | Rendering of server state and user actions |
| `features/setup/CustomIdeaEditor.tsx` | Typed/spoken input, transcript editing, interpreted changes and confirmation |
| `lib/voice/recording.web.ts`, `.native.ts` | Foreground recording, permissions, cancellation and file cleanup |
| `lib/workshopAssets.ts` | Bundled asset imports keyed by catalogue asset key; remote-image fallback |
| `convex/catalog.ts` under `frontend/` | Public choice query and internal seed/publish/revision helpers |
| `convex/heroIdeas.ts`, `speech.ts` under `frontend/` | Private custom-idea preparation, bounded transcription and server validation |
| `convex/lib/resolveSetup.ts` under `frontend/` | Resolve references, construct immutable snapshots and compose canonical generation descriptions |

These names are proposed, not existing components. Extract behaviour before
replacing styles. Use the same shared controller and draft model on every
platform; use platform files where focus, scroll or layout behaviour differs.

Mount `SetupProvider` in the root layout outside `BackendProvider` and around
the route stack/providers, so reconnects or a round-trip to Diagnostics cannot
erase it. Keep the existing diagnostics boundary and connection monitor. A
successful creation resets the draft after retaining the returned story ID for
navigation; validation, connection and creation failures preserve it.

Initial persistence scope is the running app session. Reloading the browser or
terminating the app resets an uncreated draft. Browser-history step navigation
and durable draft restoration are not promised by this implementation. If
either becomes a requirement, add it explicitly rather than putting names or
setup contents in URL query parameters.

### Draft model

Store catalogue references or prepared custom-idea references. Keep edited text
and recording progress locally until submitted for interpretation. For example:

```ts
type SetupStep = "world" | "hero" | "backpack";
type HeroStep = "character" | "outfit" | "quirk" | "name";
type KidGender = "open" | "girl" | "boy" | "non-binary";
type HeroPart = "character" | "outfit" | "quirk" | "details";
// Use generated Convex Id types in implementation; strings simplify this sketch.
type HeroChoice =
  | { kind: "catalog"; optionId: string; revision: number }
  | { kind: "custom"; ideaId: string; part: HeroPart };
type CatalogChoice = Extract<HeroChoice, { kind: "catalog" }>;

type SetupDraft = {
  step: SetupStep;
  heroStep: HeroStep;
  setting: CatalogChoice;
  problem: CatalogChoice;
  keepSetting: boolean;
  keepProblem: boolean;
  character: HeroChoice;
  outfit: HeroChoice;
  quirk: HeroChoice;
  details?: HeroChoice;
  kidGender: KidGender;
  heroName: string;
  authorName: string;
  packed: CatalogChoice[];
  revealed: { outfit: boolean; quirk: boolean };
};
```

World and backpack references resolve through the loaded catalogue too. Use
catalogue defaults as initial selections, retain the current three-item starter
bag via seed metadata and start both names empty. Hero name is required;
author credit remains optional. Revealed flags prevent outfit/quirk defaults
appearing before the child reaches those steps, and stay true after revisiting.
Keep shelf offsets in view state keyed by category, not in Convex.

Hero tabs may jump among the four hero steps. Outer steps allow returning to
World/Hero; entering Backpack through any control must validate the name. If a
name is later cleared, preserve the rest of the draft and return to the naming
field before allowing story creation. Step colours describe progress, not a
server save or a locked choice.

## 5. Convex catalogue, saved choices and open ideas

### Separate shared ideas from this story's hero

There are two different things to store: the curated ideas available on the
shelves, and the choices a child actually makes. A custom idea belongs to that
setup/story. It must not be automatically published into the shared catalogue.
The sixteen tiles are starting suggestions, not the limits of character design.

Proposed additive data model:

| Record | Fields and purpose |
| --- | --- |
| New `catalogOptions` | `key` (existing logical ID), `category`, `revision`, `active`, `sortOrder`, `label`, `displayLabel`, `promptFragment`, optional `titleSuffix`, `assetKey`, `previewFileId`, `isDefault`, `supportsGender`, `withdrawnAt`, timestamps |
| New `heroIdeas` | Private request/prepared idea: request ID, run/status, scoped normalised character/outfit/quirk/detail parts, source `typed`/`spoken`, interpretation version, base-context fingerprint, validation result, creation/expiry times; optional bound temporary audio reference while processing |
| Optional `characters.setupChoices` | Character/outfit/quirk/detail and gender snapshots, source kind, logical catalogue key/revision or custom-idea origin, resolved display text and canonical description |
| Optional `stories.setupChoices` | Setting/problem and initial backpack snapshots, preserving stable item IDs and catalogue revisions |

Use `setting`, `problem`, `character`, `outfit`, `quirk` and `item` categories.
Category-specific validators require `titleSuffix` for problems and allow
gender capability only where appropriate. Add indexes for category/active/order
queries and key/revision lookup. Enforce logical key/revision uniqueness and
one active revision per key in internal mutations; an index alone does not
make them unique. Keep assets as keys/storage references, not SVG/base64 in rows.

The story snapshots preserve the exact resolved choices. Generation uses
those snapshots and the existing composed character/world fields; changing a
catalogue label, description or active flag cannot rewrite an existing book.
Store references for provenance as well as snapshots, so retiring a catalogue
entry or expiring an unused custom idea does not break a saved story.

### Seed and publish the catalogue

Import the 48 hero choices from `character-options.json` plus the existing
settings, problems and six items with an idempotent internal seed function.
Preserve their original logical IDs, order, labels and prompt fragments. The
source JSON becomes a seed/backup fixture; it is not the runtime authority.
Code continues to define validators, categories and resolution logic.

`catalog.listChoices` returns active options, revision identifiers, short
labels, order, capability/default flags and usable preview references. Canonical prompt
fragments stay server-side. Query once for setup and subscribe to changes;
derive shelf counts and defaults from data. Keep bundled assets discoverable
through a client manifest keyed by `assetKey`, with Convex Storage URLs for new
art so a new choice can be published without a client release.

Publishing is an internal/admin operation through Convex functions or a seed
script, not a public mutation accessible to anonymous children. A full catalogue
editor is optional. Content updates create a new revision and retire the old
active revision atomically; normal label/order operations use the same path.
Existing selections remain pinned while the child decides whether to refresh
them. If a selected revision is withdrawn for safety, explain that it needs
replacement; never silently substitute a different choice at submission.

An unknown asset key renders a neutral tile and its label. An empty/unavailable
catalogue renders a retryable state, not hidden source-code defaults. Cached
loaded choices may still be browsed offline; creating a story or preparing a
custom idea waits for a connection. Audit current `@convex/catalog` imports in
both routes and backend code: title construction, backpack validation, card
item labels and prompt item-ID sets must use server records or saved snapshots.
Do not leave the story screen dependent on the old item array.

### The child's open-choice flow

Add `Tell us your idea` beside each hero shelf and `Add a detail` by the
preview. The custom entry is separate from the curated count. Accept either
typed text or a short spoken description, for example:

> “An otter with a blue cape, rainbow glasses and hiccups that make stars.”

The child can start from scratch or modify their current hero. They need not
know whether glasses count as an outfit or a quirk. An idea containing several
parts produces a proposed patch across those parts, while unchanged selections
stay intact. The review might show `Outfit: blue cape`, `Extra detail: rainbow
glasses` and `Quirk: star hiccups`. It must not replace the otter or invent a
gender/name simply to fill a schema.

1. Open an editor with the current choices as context. Offer text input and a
   microphone with explicit start/stop/cancel; do not auto-start recording.
2. Transcribe a bounded recording and show editable text. A child or adult can
   correct recognition before interpretation. Typed input joins at this stage;
   operating-system keyboard dictation works with the same text field.
3. `heroIdeas.prepare` validates length, applies real input moderation, and
   interprets the reviewed text through the existing structured-text provider.
   Require a strict output schema of proposed character/outfit/quirk/details
   and any clarification, with no tool instructions or invented preferences.
4. Show the interpretation plainly: “Here is what your hero will have.” Offer
   `Use this idea`, Edit and Cancel. Ask a short clarification only if the idea
   cannot be represented without guessing. Preserve harmless specifics rather
   than replacing them with the closest catalogue option.
5. On confirmation, apply only the displayed changes and retain other fields.
   Store the prepared-idea reference in the local draft. Final story creation
   copies its validated parts into the durable selection snapshots.

Use a discriminated union for curated versus custom selections, plus optional
extra details (§4). A custom character need not have any catalogue ID; it still
needs a canonical description. A custom outfit can coexist with a curated
otter and a different custom quirk. Editing the transcript creates a new
preparation; an older response cannot overwrite the newer draft. Bind results
to a request ID and base-context fingerprint and re-review if the base changes.

Shuffle operates on active curated suggestions only. If the current value is
curated, sample uniformly among the other suggestions; if custom, sample among
all curated suggestions. Keep the previous custom idea available for editing
within the draft rather than destroying it. Shuffle never invents new content,
modifies extra details or makes provider calls.

### Speech capture and processing

Use small `.web`/`.native` recording adapters. Evaluate Expo-compatible
`expo-audio` for foreground capture and microphone permissions; it supports
recording and web recording formats through MediaRecorder. It is not currently
installed. Recording is distinct from transcription: add a server-side
transcription adapter, with the provider selected after a device/format/cost
spike. Do not assume the current text-provider interface accepts audio.
See [Expo audio documentation](https://docs.expo.dev/versions/latest/sdk/audio/).

Do not depend on browser `SpeechRecognition` as the only implementation: it
has limited availability. It may be an optional enhancement with the same
editable-text contract. See
[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Proposed initial bounds are 20 seconds of foreground audio, 2 MiB upload and
500 characters of reviewed text, with server enforcement and clear feedback.
Validate the actual MIME type/bytes, handle silent/empty audio and choose
recording formats the transcriber accepts on iPad Safari, iOS and Android.
Keep credentials in Convex environment variables. If temporary uploads are
needed, register them against an unguessable setup-request capability, validate
the attachment binding and never accept an arbitrary file ID as permission.

`heroIdeas` are private: no public list/search or inclusion in `listChoices`.
Lookup/confirmation uses an unguessable capability consistent with the current
anonymous access model; IDs in diagnostics never grant access. Use bounded,
idempotent request records and a server-enforced anonymous/deployment quota
before paid calls; request labels alone cannot enforce a quota. Persist only
the validated interpretation and the text the family confirms for the story,
not raw speech or rejected transcripts. Delete temporary audio after processing
or cancellation, and run expiry cleanup for abandoned uploads/ideas. A
24-hour unused-idea TTL is an initial implementation default, not a new promise
of durable draft restoration.

`moderation.ts` is currently a pass-through. Replace it with an enforced
moderation/validation path for custom input and interpreted output before
enabling open input for children; schema validity alone is insufficient. Keep
transcripts as untrusted story data, separate from system instructions. Errors,
receipts and diagnostics record stages, timings and bounded usage without audio
or transcript contents. Provider timeouts, cancellation and quota refusal keep
the current choices usable; no automatic artwork generation follows speech.

Web microphone capture requires a secure context. The existing plain-HTTP LAN
iPad setup is adequate for ordinary UI checks but is not sufficient for this
microphone path. Include trusted HTTPS with secure backend connectivity, or
native capture, in voice acceptance testing. See
[MDN microphone requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

### Gender and preview behaviour

Keep the existing Kid Explorer chips optional, with Leave open as the default;
control their visibility through catalogue capability metadata. Retain a dormant
chip choice when changing characters and apply it only to the relevant choice.
Shuffle never changes it. A spoken custom character may explicitly specify
their own gender; preserve that description without inferring it from speech,
the child's voice, a name, appearance or clothing. Resolve conflicting explicit
details in the review rather than silently choosing one.

The server composes `visualDescription` from the chosen character, outfit,
extra details and applicable explicit fictional gender, and composes `quirk`
from the chosen quirk. Leave open adds no assumption. Prompt rules honour
explicit descriptions and use a name/neutral wording when gender is unspecified.
These descriptions already flow into pitch, prose, extraction and cover inputs.

Curated choices use immediate layered art. For “rainbow glasses” or an entirely
new creature, show the confirmed words beside the preview and mark custom
details as represented in text. Use a neutral portrait if no accurate base art
exists; keep any still-accurate preset layers. Do not silently display an otter
for a custom dragon or show a chef apron as the child's blue cape. An optional
generated preview can be a later explicit action with cost/retry behaviour;
it is not necessary to honour the idea in story generation.

### Server-owned story creation and rollout

Add `stories.createFromSetup`, accepting world references, curated/custom hero
references, explicit gender, trimmed names and exactly three item references.
The mutation resolves approved catalogue revisions and prepared custom ideas,
checks category/expiry/context and backpack uniqueness, creates snapshots and
composes all generation text/title on the server. Do not accept client-written
`promptFragment`, item names or moderation-success flags as authority.

Extract the current story/protagonist/five-chapter insertion into a shared
server helper. Preserve the existing downstream fields and chapter/export
pipeline. Keep typed text plain in previews and through existing cover/EPUB
escaping. Invalid, withdrawn or expired choices return a recoverable error
with the rest of the draft intact.

Roll out additively: push optional snapshot fields/new tables and generated
types, seed the catalogue, add queries/resolvers, then switch the UI endpoint.
Old stories continue to read their existing descriptions/items and have an
unknown legacy selection origin; never guess catalogue IDs from prose. Retain
the legacy create endpoint only during transition, then remove it or apply the
same input boundary so it cannot bypass custom-input validation. No bulk
rewrite of existing story descriptions or art is required.

Guard repeated submission synchronously and retain pending-request/reconnect
protections. Keep the action unavailable while disconnected. This does not
promise durable creation idempotency across termination; never blindly issue
a new create call when an earlier result is unknown. Catalogue/selection
persistence is in scope; restoring an entire unfinished draft after restart
remains a separate decision.

## 6. Visual foundation and production assets

### Tokens and fonts

Extract these colours from the actual document into `theme.ts`:

| Token | Value | Use |
| --- | --- | --- |
| paper | `#F5F3EB` | Screen background |
| surface | `#FFFEF8` | Cards, inputs, secondary controls |
| ink | `#192F3D` | Primary text, primary buttons, desktop preview |
| mutedInk | `#536673` | Supporting copy |
| mint | `#CDE4D1` | Kept/completed choices and preview scenery |
| apricot | `#F6AE89` | Shuffle/Surprise controls and accent scenes |
| violet | `#5267BB` | Focus/accent details |
| gold | `#F2D574` | Illustration accents |
| border | `#D4D8CE` | Card outlines and dividers |

Use Poppins Regular/Medium/SemiBold/Bold for UI, Source Serif 4 Regular/SemiBold
for story text, preview names and editorial card titles. The current app does
not load these families. Add licensed font files under `frontend/assets/fonts/`
with their OFL licences, declare `expo-font` as a direct Expo-compatible
dependency, and load explicit faces in `_layout.tsx`. The package is currently
transitive, not declared in `package.json`; its installed source supports
`useFonts`. Keep a usable fallback if loading fails and do not hold the app
behind an indefinite font spinner.

Reference sizes include 47px desktop/35px phone hero headings, 14–19px UI copy
and larger serif preview names. World desktop uses a larger display heading.
Use semantic type variants and responsive sizes; do not globally shrink the
screen to reproduce a 1440px frame. Use content-driven line heights and retain
text scaling. Small all-caps labels are supporting content, never the only
instructions.

Use 12–24px control/card radii, larger rounded preview panels, 2px selected
outlines and a check badge. Button depth can be a bottom border; pressed state
can reduce it with a small translation. Motion is optional, respects reduced
motion and cannot delay selection. Keep RN styles; a theme does not require
NativeWind, Tailwind or a component-library migration.

The exported EPUB and composited covers retain their existing Lexend/Fraunces
fonts. The new UI font choices do not imply rewriting the publisher or bundling
new fonts into every book.

### Asset delivery

All 48 referenced SVGs exist, parse and share `viewBox="0 0 300 300"`. Preserve
these editable sources under `docs/design/assets/`; produce app-ready assets
through a repeatable build script under `frontend/scripts/`.

Recommended first release: rasterise transparent PNG layers at appropriate
display densities using the already installed `@resvg/resvg-wasm` in a local
Node build script. Ship static `Image` sources for web/iOS/Android. Generate an
explicit `require(...)` manifest keyed by asset key so Metro can discover the
assets. Catalogue records can instead supply remote preview images; new content
must not require adding another `require` before it can appear in the shelf.
Keep this script separate from `epub:assets` and never import the rasteriser or
base64 cover bundle into client UI. This adds no runtime SVG dependency.

Compose a portrait from a character base, optional outfit overlay and small
quirk badge. Render base and outfit in the same square coordinate space with
the same scale and origin; keep the badge in a separate positioned container.
Do not tightly crop the overlay exports or inherit FigCraft's misplaced layer
coordinates. Outfit shelf thumbnails may have their own centred icon crops.

Produce a contact sheet for all **256 character/outfit combinations**, including
long ears, horns, antennae, wings and the robot. Correct common anchor/occlusion
problems in source art or a small per-character placement manifest. Do not solve
pairing problems by removing combinations the design permits. Review all 16
quirk badges separately; 4,096 flattened hero variants are unnecessary.

This matrix covers the seed artwork, not arbitrary custom characters. New
catalogue art needs equivalent checks before publication. Custom choices use
the text/neutral-preview contract in §5 rather than pretending the finite art
set covers every request.

Package four setting illustrations, or one correct scene plus clearly neutral
fallback art for the other settings during development. Build the preview
sentence from curated setting/problem copy; never retain the bakery/cake
sample for unrelated selections. A full launch-quality world set needs all
four settings covered. Problem changes can initially update text only.

For chapter cards, use three reusable neutral illustrations keyed by
`BOLD_ACTION`, `CLEVER_TRICK` and `SILLY_TWIST`, with a neutral fallback for
legacy/unknown styles. Specific item scenes may be used only when their
`suggestedItemId` matches. Card art must not imply generated events that the
card's actual text does not describe. No extra image calls per pitch.

## 7. Screen behaviour and responsive layout

### World

Desktop pairs the controls with a dark illustrated preview. Phone puts the
scene below the heading and above choices, as the reference shows. Choice
bodies open direct selection; Keep toggles affect Surprise only, not manual
selection. Keep switches have checked state and explicit labels.

Surprise resamples unlocked world categories using the current world-spin
semantics; it may return the current option. If both are kept, disable it with
an explanation. Do not apply the hero Shuffle's guaranteed-change rule here
without a product decision. World/Hero navigation preserves both Keep flags.

### Hero shelves, naming and Shuffle

- Start with sixteen curated tiles per hero shelf, in catalogue order; use the
  query's actual count as content changes. Add a separate custom-idea entry.
  Four columns on wide desktop; two on phones. Keep preview, Shuffle and
  Continue outside the shelf's scroll region.
- Direct selection changes only that category. Retain name, other choices,
  optional gender and visited/revealed state. Preserve category scroll offsets
  when switching tabs; reveal the selected tile if it is otherwise hidden.
- Shuffle samples uniformly from the other active curated options, selects the
  result, scrolls it into view and announces the short label. With a curated
  current choice, sample `[0, n - 2]` and skip its index; with a custom current
  choice, sample all `n`. Handle zero/one-option shelves without loops. Never
  reorder the catalogue or randomise a different field.
- On first arrival, show the character type, then outfit/quirk as reached.
  Show a typed name once nonblank, and retain it on previous steps.
- Name begins empty. Blank/whitespace keeps packing inactive with
  `Choose a name, then pack their bag.` A guarded attempt from another control
  focuses the name and says `Give your hero a name to keep going.`
- On the Name screen, show the chosen character/outfit/quirk summary and Back.
  `Pack their bag` advances to Backpack, not a model call or prototype-only
  confirmation dead end.

### Backpack and recent stories — proposed extensions

Initially use six catalogue-backed item tiles and three bag slots with a
`3/3 packed` count. Item count can change through catalogue publication, while
bag capacity remains the server-enforced three.
Selecting a fourth item explains that an item must be removed first. Preserve
the starter selections and explicit removal/replacement behaviour. Put the
optional author credit here, separate from the hero's name, followed by a
world/hero/bag summary and `Start the story`. Back returns to the named hero.

The Recent stories panel retains the current last-ten-stories query and links
to `/story/[storyId]`; it has close/back, empty, cached, loading and recovery
states. `listRecent` currently returns deployment-wide results with no owner
filter. Do not relabel it “Your library” or imply private account storage.
Owner-scoped history requires a separate access-model decision.

### Chapter direction, reading and completion

Use existing story/character data for the title and protagonist question. Show
five chapter markers, the current chapter index, the cleaned `recapOneLiner`
through `recapSentence`, three real beat cards, bag status and a separate
`Write this chapter` control. Hide Last time when there is no recap. Keep
generated title/pitch text; the design's Barnaby/cake copy is illustrative.

Selection calls `chapters.chooseBeat`; writing calls `chapters.writeChapter`
only after selection has been confirmed. Disable Write while a selection
mutation is pending, and disable duplicate writing/selection during a write.
Use server `chosenBeat` after reload; selection should not start writing.
Show the selected border, check and “Your choice” label without shifting card
dimensions. Show actual `IN_BACKPACK`, reserved and used item states; do not
turn a suggested item badge into an invented mandatory-use control.

Desktop cards form three columns. On phone, stack complete cards so their
labels and pitches remain visible; a horizontal carousel is not required.
Use available width for tablet rather than assuming every iPad can fit the
desktop layout. Keep the write action near the selected summary.

Separate the chapter being viewed from the active chapter. Mark completed
chapters as rereadable, the current chapter as active and future markers as
unavailable. Return from a previous chapter to the active one without altering
server state. The present UI permits opening every chapter; the new navigation
must avoid exposing pitch/write actions for future chapters. This UI restriction
does not add server-side sequence enforcement, which is separate hardening.

Read prose in a comfortable centred column with Source Serif 4, paragraph
spacing and the existing 4:3 illustration. Text remains readable while art is
pending, disabled or failed. Locking/advancing remains the existing
`chapters.lockChapter` operation; viewing a chapter marker must never lock it.
After the fifth lock, show completion and persisted export progress. Keep
portrait cover framing, coverless download, cover retry, build retry and
platform-specific `saveBook` delivery. A share/download failure must preserve
the ready server file and offer another attempt.

### Width, height, safe areas and input

Start with a content maximum around the 1440px reference and desktop padding
around 40–48px; phones use about 20px. Use a wide split layout only when both
the shelf and preview fit, initially around 1100px. Between phone and desktop,
use a stacked preview and two-column shelf. These thresholds are implementation
defaults to verify, not measurements supplied by the design.

Use a viewport-bounded shelf on sufficiently tall displays, with the clipped
next row, scroll indicator and “Scroll for more” cue. Compute available shelf
height from the space remaining after header/preview/actions. On short screens,
large text or keyboard display, allow the whole composition to scroll rather
than leaving a tiny nested shelf. Keep Shuffle and navigation reachable without
scrolling inside the shelf; they may participate in outer scrolling when space
is limited. Reserve bottom padding for any pinned actions and safe-area inset.

Use `react-native-safe-area-context`, already installed. Naming needs keyboard
avoidance and focus/scroll handling; test the input, inline error and packing
action with the keyboard open. Optional gender must expand the layout rather
than cover the shelf or footer.

### Accessibility

Label shelf groups and expose selected radio state using each platform's
supported semantics. On web, use a single tab stop for the selected tile and
arrow-key navigation based on the rendered column count, plus Home/End and
Space/Enter. Keep the selected tile visible; Shift+Tab/Tab must escape the
group. Native tiles need readable labels and selected state for VoiceOver and
TalkBack. Outfit icons/portrait layers are decorative when equivalent text is
present; expose a single concise preview summary.

Keep focus on Shuffle after a shuffle; announce the new choice politely.
Move focus to the step heading after navigation, and to invalid name input on
validation. Never move focus merely because portrait art changed. Use at least
44 × 44 targets, visible focus, checks/text in addition to colour, sufficient
contrast and layouts that work with larger text and reduced motion.

## 8. Preserve every asynchronous state

| State | Required presentation/action |
| --- | --- |
| Setup offline | Local choices still work; creation unavailable; connection status and Help remain reachable |
| Catalogue loading/empty/failed | Explicit loading, empty or retry state; no silently substituted source-code options |
| Selected catalogue revision changed/withdrawn | Retain pinned selection or explain replacement requirement; never silently rewrite it |
| Recording/permission denied/cancelled | Visible capture/stop/cancel; typed alternative; release microphone and temporary files |
| Transcription/interpretation pending/failed | Retain current hero and editable text; bounded progress/retry; ignore stale responses |
| Custom idea needs clarification/rejected | Explain what to edit without erasing previous choices or auto-publishing anything |
| Custom idea expired/quota exceeded | Reprepare when available; retain confirmed text/current choices for review |
| Recent query unresolved | Loading initially, existing ten-second timeout and reconnect feedback; cached rows stay visible |
| Pending request during reconnect | Preserve the existing protection against discarding queued mutations/actions |
| Story loading/not found | Themed loading and useful not-found/back action, distinct from a connection failure |
| No beat cards / `PITCHING` | Deal/retry control with busy state and error; do not remove the manual first deal |
| `DIRECTING`, no selection | Three choices; Write inactive with a short selection instruction |
| Selection mutation pending/failed | Prevent stale Write; retain confirmed selection; expose retryable feedback |
| `WRITING` with active token | Saved writing progress/retry count; no duplicate write, including after reload |
| Recovered/failed writing | Saved choice, `writingError` and existing retry path; preserve legacy tokenless recovery |
| `REVIEWING` / `LOCKED` | Readable prose and reread navigation, regardless of illustration/extraction state |
| Art absent/failed/disabled | Neutral frame or no art; avoid an indefinite promise that a picture is coming |
| Export cover/build/ready/failed | Derive from persisted `exportStatus`, retry/warning/error and file URL |
| Delivery failed | Keep ready book and offer save/share again |

Do not infer media readiness from a delay or implement fake percentage
progress. Existing illustration state is limited to file/prompt/extraction
fields; there is no durable image-job status. Retain bounded working copy and
a neutral fallback rather than introducing a new media schema for this theme.
Record existing operation timings/failures through diagnostics without names,
story text, typed author credit or raw preview descriptions in diagnostic logs.

## 9. Delivery slices and acceptance gates

| Slice | Work | Exit condition |
| --- | --- | --- |
| W1 — foundation | Extract current setup/story controllers; add draft provider, tokens, fonts, shell and controls | Existing setup → chapter → EPUB actions still work; reconnect retains draft; font failure leaves a usable app |
| W2 — Convex catalogue and art | Add schema/indexes, internal seed/publish and public queries; import 48 hero choices and existing world/items; build bundled/remote art contract | Seed is idempotent; database edits reach shelves; old IDs/fragments preserved; 256 seed pairings reviewed; unknown art has a usable fallback |
| W3 — setup and saved selections | Data-driven World/Hero/Backpack; structured create endpoint, server resolution and snapshots | Back/tabs retain draft; curated browsing makes no model calls; saved hero keeps its exact choices after catalogue edits; legacy stories still read |
| W4 — open ideas | Custom editor, enforced moderation, structured interpretation, private request lifecycle, confirmation and text/neutral preview | Typed custom characters/outfits/quirks/details reach generation intact; stale/cancelled responses cannot overwrite choices; no public catalogue pollution |
| W5 — spoken ideas | Recorder and transcription spike/provider choice, permissions, temporary upload cleanup, quota and HTTPS device path | Speaking → editable transcript → confirmed idea works on iPad/iOS/Android; denial, silence, timeout and cancellation preserve the draft |
| W6 — direction | Themed beat cards, chapter markers, recap, bag and independent write action | Saved choices survive reload; future chapters unavailable in UI; previous chapters rereadable; write/recovery behaviour preserved |
| W7 — reading and delivery | Themed reader, completion, recent stories and every failure/loading surface | Complete five chapters and save EPUB; failed/disabled art, writing retry, export retry and delivery retry remain usable |
| W8 — device acceptance | Responsive, keyboard, touch, assistive-tech, voice and generation spot checks | Physical-device checks below pass for curated and custom heroes; no hidden actions, broken shelves or blocking font/art states |

W2 depends on W1's asset/preview contract; W3 depends on W1–W2; W4 uses W3's
selection model; W5 feeds the same custom editor. Run the capture/transcription
spike early to expose format, HTTPS and provider constraints. W6–W7 reuse W1
and existing story behaviour. A curated-only intermediate build is useful for
testing but does not complete the requested spoken-choice experience. Acceptance
includes W4–W5 rather than deferring voice indefinitely.

### Automated verification during implementation

- Extend `src/__tests__/home.test.tsx` for step navigation, name validation,
  gender retention/omission, three-item packing, exact submission payload,
  duplicate submission protection and offline/reconnect draft preservation.
- Add focused reducer/shelf tests for category independence and reveal state;
  inject random values to prove Shuffle can reach each alternative and never
  the current curated option, and handle a custom current value or an empty/
  singleton catalogue. Verify scroll-to-selection and keyboard movement for
  two/four columns without flaky statistical distribution tests.
- Extend `convex/catalog.test.ts` for idempotent seeding, logical key/revision
  uniqueness, publication order, retired revisions, dynamic counts and legacy
  fragments. Validate asset keys/remote fallback in the build/UI checks.
- Extend `convex/stories.test.ts` for category/expiry checks, server-resolved
  names/fragments, custom parts, snapshot stability after a catalogue edit and
  legacy records without metadata. Test gender composition and its propagation
  into pitch, prose, extraction and cover inputs.
- Add custom-idea action tests using fake providers: preserve “blue cape and
  rainbow glasses”, apply multi-part patches, retain unspecified fields, reject
  malformed/unsafe output, require clarification when needed and prevent public
  listing, forged references, stale-run commits or expired-idea consumption.
- Add recorder/transcription tests for permission denial, empty audio, duration/
  byte/MIME bounds, cancellation, retry/quota refusal, temporary-file cleanup
  and transcript editing. A failed interpreter must not erase a valid hero.
- Retain/extend `src/__tests__/story.test.tsx` for server selection, pending
  selection before Write, persisted writing/export errors, active versus viewed
  chapter, completion and delivery recovery. Keep tests outside `src/app/`.

Run focused Jest and Convex Vitest suites while changing their areas, then
`npm run check` and `npx expo export --platform web` from `frontend/`. Export
iOS/Android bundles when platform code/fonts/assets change. These schema/API
changes require `npx convex dev` against a configured deployment and regenerated
committed `_generated/` types. Run the internal seed before enabling the new UI. Never
hand-edit generated types or commit `dist/`, `.expo/` or local credentials.

### Manual acceptance

Check 390px phone and 1440px desktop references, a narrower 320px viewport,
iPad portrait/landscape, short landscape windows and enlarged text. Verify
final-row selection, visible scroll cues, Shuffle visibility/focus, optional
gender layout and naming with the keyboard open. Exercise web keyboard-only
navigation, VoiceOver and TalkBack; inspect the actual focus order and tile
announcements, not only accessibility props in tests.

Use `npm run web:lan` for physical iPad Safari testing and verify Convex storage
URLs use the LAN host. The previous iPad recent-stories spinner is not confirmed
resolved; exercise that exact connection/timeout/reconnect path again. Verify
native sharing on an actual device: a compiled bundle cannot prove the OS sheet.

Voice additionally needs the HTTPS/native path in §5. Check a child's quiet or
hesitant speech, invented names, corrections, interruptions and a spoken idea
that changes several parts. Confirm the actual words survive interpretation,
the review is understandable, cancellation stops recording and no raw audio or
transcript appears in diagnostics or the shared catalogue. These are device
acceptance checks to perform, not completed research with children.

Use fixtures/mocked provider responses for regression work. For the final
generation spot check, exercise an explicitly gendered Kid Explorer, a
Leave open character and a custom hero with distinctive requested details;
inspect prose and illustrations for unwanted inference or dropped details,
and confirm existing fallback/retry controls. Local dev text models can verify
plumbing but do not establish prose quality. Any deliberate paid generation
uses the existing provider settings. Curated preview tests need no provider
calls; custom input adds metered transcription/interpretation with mocked
regression tests and separately bounded live checks.

## 10. Decisions still requiring visual/product review

Implementation can proceed with the defaults above. Review these concrete
extensions before calling the revised experience visually complete:

1. Direct world picker, Backpack/author-credit composition and Recent stories
   panel; these controls exist in the app but have no revised frames.
2. The corrected outfit placement, simplified artwork versus preserved prompt
   descriptions, remaining world scenes and neutral beat-style illustrations.
3. Stacked tablet/phone chapter cards, reading/completion layouts and short-height
   shelf fallback, checked with real text and keyboards.
4. Custom-idea entry/review/clarification and text-only preview composition;
   children must be able to tell which details have been understood.
5. Transcription provider, accepted formats, effective moderation implementation
   and bounded processing/retention settings, proven through the W5 spike.
6. Whether future work should restore uncreated drafts across restarts or
   support browser Back through setup steps. Convex catalogue and saved selection
   snapshots are now in scope; they do not imply persistent unfinished drafts.

Spoken hero setup is now in scope, superseding the earlier v0 voice exclusion
for this specific flow. Chapter voice wildcards, video, toy scanning, account
ownership, remixing and a new state library remain separate decisions. Choose
the speech adapter without changing the existing prose/image providers.

## Inspection record

This plan was prepared by reading the native archive's `document.json`, running
`figcraft-cli info`, viewing representative exports across all three pages and
freshly rendering node `3201` from the current source. All 48 SVG references
were parsed and their common viewBox checked. The HTML prototype's selection,
preview, keyboard and Shuffle code was inspected as an interaction reference;
its reported interaction checks were not rerun here. The Expo routes, catalogue,
schema, creation/chapter/media flows, delivery helpers and existing tests were
read. App tests and live provider/device checks were not run for this
documentation-only change. The revision also inspected the moderation stub and
text-provider interface and checked the official recording/browser references
linked in §5. No transcription provider or live microphone path has been tested.
