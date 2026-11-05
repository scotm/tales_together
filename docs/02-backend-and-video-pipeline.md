# 02 — Convex Backend State Machine & Multimodal Media Pipeline

## 1. Architectural Overview

If an LLM is left to manage a multi-chapter story purely through chat history, by Chapter 4 it will
forget what is in the hero's backpack, hallucinate new characters, or rush the ending.

Instead, the **Convex deployment** acts as a **deterministic Finite State Machine (FSM)** that owns
the canonical story state, feeding strictly scoped context into the LLM at each step and
orchestrating image and video generation from **actions**.

There is no second backend, no ORM and no job queue of our own:

- **State** lives in three tables (`stories`, `characters`, `chapters`) declared in `convex/schema.ts`.
  That file is the only source of truth; `docs/04` and `docs/05` read the shapes from it.
- **Mutations** are the only writers. Every state transition below is one mutation, so the UI never
  observes a half-applied step.
- **Actions** call the LLM, image and video providers, then write the result through a mutation.
  They have no database transaction, so each write must be self-contained.
- **Queries** are reactive. The child's screen is a `useQuery` subscription: a paragraph or
  illustration appearing in the database *is* the push event. No SSE, no WebSocket layer, no
  polling from the client.

`frontend/convex/schema.ts` is the current file. The schema shown in §3 is the target shape for the
chapter loop; keep them in step as fields land.

---

## 2. The Canonical Story View

Prompts never see the tables directly. A single helper assembles them into the shape the prompt
templates in `docs/03` expect, so the model sees one stable document regardless of how the tables
change.

```jsonc
{
  "storyId": "st_98234",
  "status": "IN_PROGRESS",
  "config": {
    "readingLevel": "AGES_7_9",
    "totalChapters": 5,
    "artStyle": "Warm watercolour and ink children's book illustration, Quentin Blake meets Studio Ghibli",
    "vibe": "SILLY_ADVENTURE"
  },
  "world": {
    "setting": "An underwater bakery inside a giant sunken teapot",
    "centralProblem": "The Royal Sponge Cake has grown wings and floated out the chimney",
    "characters": [
      {
        "id": "j57c0ffee",                                // = the Convex document id
        "name": "Barnaby Whiskers",
        "role": "PROTAGONIST",
        "visualDescription": "A small scruffy brown river otter wearing a tall crooked white chef hat and red polka-dot apron",
        "referenceFileId": "kg2…",                       // optional, post-v0
        "quirk": "Hiccups floating rainbow bubbles whenever he gets nervous"
      }
    ],
    "items": [
      { "id": "item_whisk", "name": "Golden Whisk", "status": "IN_BACKPACK" },
      { "id": "item_jam", "name": "Jar of Glow-Jam", "status": "USED", "usedInChapter": 2 }
    ],
    "unresolvedThreads": ["Catch the floating Royal Sponge Cake before the Coral Queen arrives"]
  },
  "chapters": [
    {
      "index": 1,
      "arcRole": "HOOK_AND_INCITING_INCIDENT",
      "status": "LOCKED",
      "chosenBeat": {
        "cardId": "card_1a",
        "style": "BOLD_ACTION",
        "title": "Chase the cake",
        "kidFriendlyPitch": "Barnaby grabs a net and swims after the cake!",
        "iconEmoji": "⚔️"
      },
      "modifiers": {
        "useItemId": null,
        "spotlightCharacterId": null,
        "weatherOrMood": "BUBBLY_CHAOS",
        "soundEffectsBoost": true,
        "endingStyle": "CLIFFHANGER"
      },
      "summaryBullets": [
        "Barnaby was preparing for the Coral Queen's party in the sunken teapot bakery.",
        "A mysterious purple current sucked the Royal Sponge Cake out the chimney.",
        "Barnaby grabbed his backpack and swam into the Kelp Forest."
      ],
      "paragraphs": ["...", "..."],
      "media": {
        "illustrationFileId": "kg2…",
        "videoFileId": null,
        "isKeyVideoChapter": true
      }
    }
  ]
}
```

**Naming:** the tables, the validators, the prompts and the client all speak **camelCase**, because
there is no wire boundary to convert across. Every `id` in this view is either a Convex document id
or a **catalog id minted at story creation** (`item_whisk`, `set_bakery`, `quirk_bubbles`). Never an
index like `item_1`.

### The Chapter Lifecycle

Five `chapters.status` values, and one orthogonal `extractionStatus`:

1. **`PITCHING`** — 3 beat cards requested (pre-generated while the child reads Chapter *N-1*).
   **Input:** the story view + `chapters[1..N-1].summaryBullets` + the arc role of Chapter *N*.
   **Output:** exactly 3 cards (`BOLD_ACTION`, `CLEVER_TRICK`, `SILLY_TWIST`), written as
   `beatCards`. If the child uses the voice wildcard, Prompt 1 adds a 4th (`KID_WILDCARD`).
2. **`DIRECTING`** — the child picks a card and sets the spice-rack modifiers. The chosen card is
   copied into `chosenBeat`; nothing reads `beatCards` afterwards.
3. **`WRITING`** — the `generateChapter` action streams prose. **Input:** reading-level matrix + the
   story view + prior `summaryBullets` + the **verbatim last two paragraphs** of Chapter *N-1* + the
   chosen beat and modifiers. Each finished paragraph is appended by an internal mutation, so the
   child starts reading immediately.
4. **`REVIEWING`** — the child reads and may remix a single paragraph (Prompt 5). Extractors may still
   be running; `extractionStatus` (`PENDING | RUNNING | DONE | FAILED`) tracks that separately so a
   failed extraction never blocks the reader.
5. **`LOCKED`** — the child taps "Next Chapter!". Prose and media freeze. Extraction is retried here
   if it is still `FAILED` or `RUNNING`, because the EPUB needs it.

`stories.status` is only `SETUP | IN_PROGRESS | COMPLETED`. Chapter-level progress is *not* a story
status; derive it from `chapters` rather than adding a second state machine.

---

## 3. Convex Schema (`convex/schema.ts`)

Three tables, with media as `_storage` file ids. Chapter prose lives in its own `chapters` row and
never inside the `stories` document: **documents are capped at 1 MiB**.

```ts
// convex/schema.ts (target shape; the committed file is the source of truth)
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const readingLevel = v.union(
  v.literal("AGES_4_6"),
  v.literal("AGES_7_9"),
  v.literal("AGES_10_12"),
);
export const storyStatus = v.union(
  v.literal("SETUP"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
);
export const chapterStatus = v.union(
  v.literal("PITCHING"),
  v.literal("DIRECTING"),
  v.literal("WRITING"),
  v.literal("REVIEWING"),
  v.literal("LOCKED"),
);
export const extractionStatus = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("DONE"),
  v.literal("FAILED"),
);
export const itemStatus = v.union(
  v.literal("IN_BACKPACK"),
  v.literal("RESERVED_THIS_CHAPTER"),
  v.literal("USED"),
);

export const beatCard = v.object({
  cardId: v.string(),
  style: v.union(
    v.literal("BOLD_ACTION"),
    v.literal("CLEVER_TRICK"),
    v.literal("SILLY_TWIST"),
    v.literal("KID_WILDCARD"),
  ),
  title: v.string(),
  kidFriendlyPitch: v.string(),
  iconEmoji: v.string(),
  suggestedItemId: v.optional(v.string()), // catalog id, e.g. "item_whisk"
});

export const directorModifiers = v.object({
  useItemId: v.optional(v.string()),                  // catalog id
  spotlightCharacterId: v.optional(v.id("characters")), // document id
  weatherOrMood: v.optional(
    v.union(
      v.literal("SUNNY"),
      v.literal("STORMY"),
      v.literal("SPOOKY_NIGHT"),
      v.literal("BUBBLY_CHAOS"),
    ),
  ),
  soundEffectsBoost: v.boolean(),
  endingStyle: v.union(v.literal("CLIFFHANGER"), v.literal("COZY_PAUSE")),
});

export default defineSchema({
  stories: defineTable({
    title: v.string(),
    status: storyStatus,
    readingLevel,
    totalChapters: v.number(), // fixed 5 in v0
    vibe: v.string(),
    artStyle: v.string(),
    world: v.object({
      setting: v.string(),
      centralProblem: v.string(),
      unresolvedThreads: v.array(v.string()),
    }),
    items: v.array(
      v.object({
        id: v.string(), // stable catalog id, never "item_1"
        name: v.string(),
        status: itemStatus,
        usedInChapter: v.optional(v.number()),
      }),
    ),
    authorName: v.optional(v.string()),        // typed name in v0
    authorSignatureSvg: v.optional(v.string()), // post-v0, sanitised
    coverFileId: v.optional(v.id("_storage")),
    epubFileId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }),

  characters: defineTable({
    storyId: v.id("stories"),
    name: v.string(),
    role: v.union(
      v.literal("PROTAGONIST"),
      v.literal("SIDEKICK"),
      v.literal("PET"),
      v.literal("ANTAGONIST"),
    ),
    quirk: v.string(),
    visualDescription: v.string(),
    referenceFileId: v.optional(v.id("_storage")), // post-v0 toy scan
  }).index("by_story", ["storyId"]),

  chapters: defineTable({
    storyId: v.id("stories"),
    index: v.number(), // 1-based
    title: v.optional(v.string()),
    arcRole: v.string(),
    status: chapterStatus,
    beatCards: v.array(beatCard),      // generated, never edited
    chosenBeat: v.optional(beatCard),
    modifiers: v.optional(directorModifiers),
    paragraphs: v.array(v.string()),
    summaryBullets: v.array(v.string()),
    vocabNotes: v.array(v.object({ word: v.string(), kidDefinition: v.string() })),
    extractionStatus,
    illustrationPrompt: v.optional(v.string()),  // written by the extractor
    videoMotionPrompt: v.optional(v.string()),
    illustrationFileId: v.optional(v.id("_storage")),
    videoFileId: v.optional(v.id("_storage")),   // post-v0
    isKeyVideoChapter: v.boolean(),              // post-v0
  })
    .index("by_story", ["storyId", "index"])
    .index("by_story_status", ["storyId", "status"]),
});
```

There is no separate `OUTLINING` story status and no `POST_PROSE_EXTRACTION` chapter status: the
extractor runs *during* `REVIEWING`, and `extractionStatus` says how it is going.

---

## 4. Structured LLM Contracts

Two things have to line up:

1. **A JSON Schema sent to the provider** so structured-output mode cannot return prose instead of
   JSON.
2. **A Convex validator** on the mutation that stores the result, so a malformed object is rejected
   before it reaches the database.

Convex validators are not JSON Schema and are not a runtime parser for arbitrary values, so keep one
`convex/llm/jsonSchemas.ts` next to the validators and a unit test asserting each schema's required
keys match the validator's fields. That test is the whole guarantee; without it the model can drop a
field and nothing notices until render time.

Validators are also **not instructions**. The description text below ("max 25 words", "inline the
full visual description") belongs in the prompt, and the prompt is the only thing that makes the
model obey it.

```ts
// convex/llm/jsonSchemas.ts — one schema per call, mirrored by a validator
export const beatCardSchema = {
  type: "object",
  required: ["cardId", "style", "title", "kidFriendlyPitch", "iconEmoji"],
  properties: {
    cardId: { type: "string" },
    style: {
      type: "string",
      enum: ["BOLD_ACTION", "CLEVER_TRICK", "SILLY_TWIST", "KID_WILDCARD"],
    },
    title: { type: "string", description: "Punchy title for the UI card, max 5 words" },
    kidFriendlyPitch: {
      type: "string",
      description: "1-2 sentences written directly to the child, max 25 words",
    },
    iconEmoji: { type: "string", description: "Single emoji for this choice" },
    suggestedItemId: { type: ["string", "null"] },
  },
} as const;

export const beatPitchSchema = {
  type: "object",
  required: ["recapOneLiner", "cards"],
  properties: {
    recapOneLiner: { type: "string" },
    cards: { type: "array", items: beatCardSchema, minItems: 3, maxItems: 3 },
  },
} as const;
```

The post-chapter extractor writes through a mutation whose argument validator *is* the contract:

```ts
// convex/chapters.ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const applyExtraction = internalMutation({
  args: {
    chapterId: v.id("chapters"),
    chapterTitle: v.string(),
    summaryBullets: v.array(v.string()), // exactly 3, checked below
    itemsUsed: v.array(v.string()),      // catalog ids
    newItems: v.array(v.object({ id: v.string(), name: v.string() })),
    unresolvedThreads: v.array(v.string()),
    illustrationPrompt: v.string(),
    videoMotionPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.summaryBullets.length !== 3) {
      throw new Error("extraction must return exactly 3 summary bullets");
    }
    // update chapter, then story.items / story.world.unresolvedThreads in the same mutation
  },
});
```

The image/video prompts are stored on the chapter in the same write, because they are derived from
the prose that will never change again.

### Vision "Snap Your Real Toy" (post-v0)

Same pattern, one call, one schema: `suggestedName`, `speciesOrType`, `canonicalVisualDescription`
(30–45 words, objective colours/textures/proportions), `suggestedQuirk`. The photo is uploaded with
`generateUploadUrl`, the action reads it back through `ctx.storage.get`, and the generated
description becomes `characters.visualDescription` — the same field every prompt inlines, so a
scanned toy and a catalog-built character are indistinguishable downstream.

---

## 5. The Media Pipeline (actions, external binaries)

### Solving character consistency and latency

1. **Static illustration first.** The `illustrateChapter` action generates `ch_N` in ~3s, stores it
   with `ctx.storage.store`, and writes `illustrationFileId`. The child's frame flips to the still
   while they are still reading.
2. **Image-to-video anchor (post-v0).** For key chapters, pass the *same* still to
   `grok-imagine-video` (or Veo) as `image_url`, so frame one matches the poster exactly.
3. **Transcode elsewhere.** A Convex action has no FFmpeg binary and a 10-minute Node cap, so the
   H.264 pass (`-crf 26 -pix_fmt yuv420p -movflags +faststart -an`) runs on an external service.
   Failure is non-fatal: the chapter keeps its still. See `decisions.md` → *Async + media
   processing* for the FFmpeg Micro / Trigger.dev trade-off.

```ts
// convex/media.ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const illustrateChapter = internalAction({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.runQuery(internal.chapters.getForPipeline, { chapterId });
    const prompt = [
      chapter.illustrationPrompt,
      `Style: ${chapter.artStyle}.`,
      "Children's storybook illustration, no text, no speech bubbles.",
    ].join(" ");

    const res = await fetch(`${process.env.IMAGE_API_URL}/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.IMAGE_API_KEY}`,
      },
      body: JSON.stringify({ prompt, aspectRatio: "4:3" }),
    });
    if (!res.ok) throw new Error(`illustration failed: ${res.status}`);
    const { url } = (await res.json()) as { url: string };

    const image = await fetch(url);
    const fileId = await ctx.storage.store(await image.blob());
    await ctx.runMutation(internal.chapters.setIllustration, { chapterId, fileId });
  },
});

export const animateKeyChapter = internalAction({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.runQuery(internal.chapters.getForPipeline, { chapterId });
    if (!chapter.isKeyVideoChapter || !chapter.illustrationUrl) return;

    const stillUrl = chapter.illustrationUrl; // public URL from ctx.storage.getUrl
    const create = await fetch(`${process.env.VIDEO_API_URL}/v1/video/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.VIDEO_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: `${chapter.videoMotionPrompt} Style: ${chapter.artStyle}.`,
        image_url: stillUrl,
        duration: 5,
        aspect_ratio: "4:3",
        resolution: "480p",
      }),
    });
    if (!create.ok) return; // non-fatal: keep the still
    const { id } = (await create.json()) as { id: string };

    // Poll inside the action; the 10-minute Node cap is the ceiling.
    // shortcut: fixed 2s poll, cap at 30 attempts; move to a scheduled action if
    // providers get slower.
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await fetch(`${process.env.VIDEO_API_URL}/v1/video/generations/${id}`, {
        headers: { authorization: `Bearer ${process.env.VIDEO_API_KEY}` },
      });
      const body = (await status.json()) as { status: string; url?: string };
      if (body.status !== "completed") continue;
      if (!body.url) return;
      // Transcode + store through the external service, then:
      // await ctx.runMutation(internal.chapters.setVideo, { chapterId, fileId });
      return;
    }
  },
});
```

Two rules that keep this from becoming a retry furnace:

- Every action writes its own terminal state (`DONE` / `FAILED`) so the UI can stop waiting.
- Nothing in the pipeline is required for the book to exist. A missing still is a plainer EPUB; a
  missing video is a still. Only prose and the EPUB itself are load-bearing.

---

## 6. Cost & Token Guardrails for Production

Video generation is the highest marginal cost in the pipeline.

- **Hard per-story budget**, configured in one place, counting retries: **$0.50 and 6 images per
  book** to start. Exceeding it fails loudly with a clear message; it never silently spends.
- **"Magic Living Picture Tickets" per book (post-v0):** 2–3 per 5-chapter book, automatically
  applied to Chapter 1 and the finale, plus one golden ticket the child can slap onto the middle
  chapter they loved.
- **480p / 5-second cinemagraphs:** inside an e-reader frame (`max-height: 62vh`) a 480p loop is
  indistinguishable from 1080p, generates twice as fast, and keeps the archive small enough to share.
- The budget counter lives on the `stories` row and is incremented by the action that spends, in the
  same mutation that records the result. A counter updated by the UI is not a budget.
