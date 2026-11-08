# Custom ideas, speech and story screens

The workshop accepts typed ideas and short foreground recordings. Speech becomes
editable text. Reviewing text produces a moderated, structured proposal; only
**Use this idea** confirms and applies the displayed changes. Unchanged choices,
names, world and bag stay intact. Custom details appear in words beside an honest
preview, with neutral artwork for unsupported characters/outfits.

## Deploy and configure

From `frontend/`:

```sh
npm install
npx convex dev --once
npm run workshop:assets
```

The additive schema includes `heroIdeaSessions`, `heroIdeas` and `heroIdeaQuota`.
Existing curated snapshots, stories, chapters and export files need no rewrite.
The anonymous free-form `stories.create` endpoint is now internal; refresh older
open clients to use `stories.createFromSetup`. This closes the old route around
custom-input validation. Existing story links continue to work.

Transcription uses the deployment's existing `GEMINI_API_KEY`, independently of
the prose/image providers. `SPEECH_GEMINI_MODEL` optionally overrides its model;
otherwise it uses the existing configured fast Gemini model. Interpretation and
moderation use `getTextProvider("structured")`, including the existing local
OpenAI-compatible development adapter when configured. There is no automatic
vendor fallback and no provider credential in the client.

The speech adapter sends inline audio to Gemini `generateContent`, with a
transcription-only prompt and structured response. It creates no remote file or
Convex Storage upload. See [Google's audio input reference](https://firebase.google.com/docs/ai-logic/analyze-audio)
and [Gemini audio documentation](https://ai.google.dev/gemini-api/docs/audio).
The existing `responseSchema` adapter uses an OpenAPI subset; omit
`additionalProperties` in API schemas and enforce unknown-field rejection in the
local parsers. A live test caught and corrected this API incompatibility.

Native recording uses `expo-audio` with foreground recording and background
recording/playback disabled in app configuration. Permission requests occur only
after **Speak your idea**. Native permission configuration changes require a
fresh native build. Browser recording uses feature-detected MediaRecorder with
Opus/WebM or MP4. See the [Expo recording reference](https://docs.expo.dev/versions/latest/sdk/audio/).

## Input bounds and lifetime

- Reviewed text: 1–500 characters.
- Recording: 20 seconds, up to 2 MiB. The server validates signatures, MIME,
  audio metadata and duration before a provider call. Encoder padding has a
  250 ms allowance. Unmeasurable or malformed recordings are rejected.
- Native capture produces AAC/MP4. Browser capture uses supported WebM/Opus or
  MP4. Measurable WAV is also accepted by the server. Durationless WebM is checked
  by counting Opus packet durations; a client-supplied duration is never trusted.
- Moderation requests use a 20-second timeout and two attempts. Interpretation
  and transcription use 30 seconds and two attempts, through the existing retry
  transport. The five-minute request watchdog closes abandoned pending work.
- Prepared ideas and private capabilities expire after 24 hours. An hourly
  bounded cleanup deletes expired rows. A saved book keeps independent resolved
  snapshots, so expiry cannot remove its hero.

`music-metadata` runs only in the Node audio action for container validation.
No FFmpeg service or binary is added to Convex. Development fixtures include
actual AAC/MP4 and durationless Opus/WebM containers; see the
[metadata parser reference](https://github.com/Borewit/music-metadata).

Each session uses a random 256-bit capability. Only its SHA-256 hash is stored.
The capability stays in the running setup draft, outside the backend subtree;
it is never put in URLs, diagnostics or story snapshots. IDs alone cannot read
or confirm private ideas. There is no public list/search endpoint for them.

Request IDs are bound to an input/context fingerprint and are idempotent.
Confirmation checks the exact reviewed text and the original base references.
The reducer checks that base again when applying the result. Cancellation marks
the request or creates a bounded cancellation tombstone, preventing late claims
or responses from replacing the hero. Microphone tracks/recorders and temporary
native files are released on stop, cancellation, unmount, backgrounding and
route blur, including when Expo keeps an inactive screen mounted.

Raw audio is never written to Convex Storage or the application tables. Raw
transcripts remain editable in client memory. Prepared rows retain only approved
interpretations; the reviewed text is stored only after confirmation and copied
into durable custom-choice snapshots. Rejected/cancelled text and provider
response bodies are excluded from diagnostics. In-flight remote calls may finish
after cancellation; their results cannot be applied, and later stages/retries
check the saved cancellation state.

## Usage limits and moderation

`convex/lib/heroIdeaConfig.ts` defines deployment-wide and anonymous session
limits. Before paid work starts, a transaction reserves 12 request units for an
idea preparation or four for transcription, conservatively allowing transport
retries. The deployment permits 600 units per UTC day; a session permits 48 units
per 15 minutes and at most 32 request records. Session creation is separately
limited to 1,000 per UTC day. New request IDs or sessions cannot evade the shared
paid-work cap. Failures consume their reservation; preset browsing remains
available after quota refusal.

The old moderation pass-through is replaced with enforced, structured model
classification. Both reviewed input and the proposed output are checked;
malformed, uncertain or unsafe classification fails closed. The same boundary
now checks chapter pitches and prose. Policy covers age-appropriate content,
real personal identifiers and instruction/secret-extraction attempts while
allowing harmless magic, fictional gender, mild peril and ordinary differences.
Interpretation preserves requested details, proposes only explicit changes and
asks for clarification rather than filling missing preferences. A classifier
and schema checks are implemented; the live synthetic test is not a child safety
or recognition-quality evaluation with families.

Use the existing diagnostics CLI for operation names `hero_idea.prepare` and
`hero_idea.transcribe`. Provider attempt/usage receipts are retained through the
existing diagnostics system, with no audio, transcript or capability fields.
Missing cost data remains unknown. The independent per-book spend ledger is
still separate work.

## Story-screen behavior

`ChapterDirector`, `ChapterReader`, `BookCompletion` and `ChapterNavigation` share
`useStoryWorkshop`. The director shows real saved pitches, cleaned recap, actual
inventory states and an independent write control. A pending choice blocks
writing; synchronous guards prevent duplicate operations. Five chapter markers
allow completed rereads and the current chapter; future markers are unavailable.
Reading a marker never locks or advances a chapter. Backend sequence hardening
remains separate.

The reader uses Source Serif 4, a centred reading column and the existing 4:3
artwork. Prose stays readable through missing/disabled/failed art. Completion
uses a portrait cover and persisted export stages, cover/build retries, warning
and coverless download paths. Save/share failure retains the ready file and
retry control. EPUB typography, static media, provider choices and file delivery
remain in their existing pipeline. Neutral SVG-derived beat illustrations use
style keys and make no extra generation calls or promises about pitched events.

## Verification and manual acceptance

`npm run check` covers 64 frontend/delivery tests and 171 backend cases.
Web/iOS/Android exports compile. Coverage includes confirmed multi-part patches,
capability forgery, changed bases, altered review text, expiry, cancellation,
quotas, strict output validation, audio formats/bounds, recording cleanup,
editable speech, route blur, independent card selection/write and all prior
writing/export/delivery recovery paths.

A deployed local test used a synthetic recording: “An otter with a blue cape,
rainbow glasses and hiccups that make stars.” Transcription, input moderation,
interpretation and output moderation completed in about 3.7 seconds. The result
preserved all three specifics, proposed outfit/details/quirk changes, kept the
curated otter and still required confirmation. It created no book or artwork;
the unconfirmed private records were cancelled afterwards. The earlier failed
schema request is retained as diagnostic evidence.

To repeat that **metered** check with a synthetic recording:

```sh
node scripts/smoke-hero-ideas.mjs /path/to/synthetic-idea.m4a
```

The script prints pass/fail and preserved-feature flags, never capabilities,
audio or transcripts, and cancels its unconfirmed requests. Mocked regression
tests need no key or provider calls.

Still perform physical iPad/iOS/Android permission, interruption, microphone and
sharing checks; quiet/hesitant speech and invented names; browser keyboard/focus
and screen-reader checks; enlarged text/keyboard-open layouts; and responsive
visual review of the new story screens. Browser capture requires a secure
context: ordinary HTTP LAN iPad testing retains the typed alternative. Use trusted
HTTPS with secure backend connectivity or native capture for speech acceptance.
These device checks have not been claimed as complete.
