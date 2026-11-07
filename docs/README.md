# Tales Together — Architecture & Design Documentation

**Tales Together** is a collaborative, child-centric interactive story generator and **EPUB 3** publishing platform. Rather than treating AI story generation as "press a button, get a book", **Tales Together** puts the child in the **Director's Chair** as Co-Author—combining a tactile, toy-box user interface with a deterministic backend state machine, living chapter illustrations (via **xAI Grok Video** or **Google Gemini + Veo**), and a custom heirloom **EPUB 3 Compiler**.

---

## 📚 Documentation Index

1. **[01 — Product Vision & Cross-Screen UX Features](./01-product-and-ux-features.md)**
   * World-Building & Character Forge (The Toy Box)
   * Interactive Chapter-by-Chapter Co-Pilot (The Director's Chair)
   * Age-Adaptive Reading & Pedagogical Features
   * Visuals, Living Pictures & Audio Enhancements
   * Continuity ("The Cinematic Universe" & Series Bible)
   * Adaptive Layout Philosophy Across Phone, Tablet, and Desktop
   * Screen-by-Screen UI Flows & Micro-Interactions

2. **[02 — Backend State Machine & Multimodal Media Pipeline](./02-backend-and-video-pipeline.md)**
   * Canonical Story View Assembled from Convex Tables
   * Chapter Lifecycle Finite State Machine (FSM)
   * Convex Schema (`stories`, `characters`, `chapters`)
   * Convex Validators for Structured LLM Outputs
   * Vision "Snap Your Real Toy" Character Scanner (`ScannedToyCharacterSheet`)
   * Action-Driven Media Pipeline (Static Illustration $\rightarrow$ Grok/Veo Image-to-Video $\rightarrow$ External H.264 `faststart` Transcode)
   * Cost & Unit-Economics Guardrails ("Magic Living Picture Tickets")

3. **[03 — Prompt Engineering & Pacing Matrices](./03-prompt-engineering-templates.md)**
   * Granular Reading Level Matrix (`AGES_4_6`, `AGES_7_9`, `AGES_10_12`)
   * Deterministic Story Arc Pacing Engine (`getArcRoleInstructions`)
   * Global "Anti-Slop" & Kid-Safe Guardrail System Preamble
   * **Prompt 1:** The Voice-Wildcard Normaliser (Child Audio $\rightarrow$ Story Card)
   * **Prompt 2:** The Chapter Beat Pitcher (Generating the 3 Tarot Cards)
   * **Prompt 3:** The Core Chapter Prose Generator (Streaming with Verbatim Continuity Anchor & Spice Rack Modifiers)
   * **Prompt 4:** Post-Chapter State Extractor & Visual/Video Cinematographer
   * **Prompt 5:** Surgical "Magic Wand" Paragraph Remixer
   * Zero-Latency Pre-Generation & Automated Quality Linting

4. **[04 — Interactive React Frontend Components](./04-frontend-react-components.md)**
   * Tactile Design System & Micro-Interaction Hook (`useTactileFeedback.ts`)
   * Client-Side State Machine (`storyDirectorContext.tsx`, reducer + context)
   * The Toy Box Catalogue (`toyBoxCatalog.ts`)
   * The Toy Box & Character Creator (`ToyBoxCreator.tsx` — Padlock Slot Machine, 3D Trading Card, Peel-and-Stick Quirk Stickers, Real-Toy Camera Scanner, 3-Pocket Backpack Conveyor Belt)
   * Adaptive Cross-Screen Workbench (`StorybookWorkbench.tsx`)
   * The Chapter Director's Chair (`DirectorsChair.tsx`)
   * The Tactile Backpack Drawer (`BackpackDrawer.tsx`)
   * The Living Storybook Page (`LivingStorybookPage.tsx` — 3-Stage Media Frame & Magic Wand Paragraph Remixing)

5. **[05 — Deterministic EPUB 3 Compiler & XHTML/CSS Templates](./05-epub3-compiler-and-templates.md)**
   * Why Custom `JSZip` + Template Functions Beat Legacy Libraries
   * EPUB 3 Archive Structure & Byte-Order Rules
   * Progressive Enhancement `<video>` Across Apple Books, Readium, and Kindle E-Ink
   * Complete `epub.ts` Convex Action
   * `storybook.css` (Drop Caps, Dyslexia-Friendly Typography, Unbreakable Media Frames, Night-Mode Support)
   * `chapter.xhtml` (HTML5 `<video>` with `<img>` Fallback & Native EPUB 3 Pop-Up Vocabulary Footnotes)
   * `titlepage.xhtml` (With Embedded Child SVG Handwritten Signature)
   * `appendix.xhtml` (Character Trading Cards & "Behind the Scenes: Director's Notes")
   * `content.opf`, `nav.xhtml`, `container.xml`, and Automated Vitest + `epubcheck` Validation

**[Decisions & gotchas](./decisions.md)** — append-only log of vendor choices, verified API sharp
edges, and open platform questions. Read before adding infrastructure.

**[Build plan](./06-build-plan.md)** — the slices to build, in dependency order, with an exit test
for each. Start here when picking up work.

**[Application diagnostics plan](./07-application-diagnostics-plan.md)** — proposed
operation timelines, provider-attempt logging, offline support reports, private
inspection, retention and cost evidence, delivered in five slices. D0–D2 are
implemented; see the **[diagnostics runbook](./diagnostics-runbook.md)** for
collecting a report, finding a trace and interpreting retries.

**[Design notes](./design/)** — `asset-backlog.md` (graphics still needed, already v0-scoped) and
`figcraft.md` (how to drive the FigCraft source build).

---

## 🏗️ High-Level System Flow

```text
[ Child + Parent UI (Expo: web / iOS / Android) ]
       │
       ├─ 1. Toy Box Setup: Spins Padlock World Reels, builds Hero Trading Card,
       │     snaps photo of real toy, and packs 3 items into the Backpack.
       │
       ├─ 2. Director's Chair (Loop x5 Chapters):
       │     Picks 1 of 3 Tarot Beat Cards (or holds Giant Red Mic for a Wildcard)
       │     + toggles Spice Rack modifiers ("Use Golden Whisk", "Stormy", "Cliffhanger").
       ▼
[ Convex deployment: queries / mutations / actions ]
       │  (schema.ts is the source of truth for stories, characters, chapters)
       │
       ├─ 3. `generateChapter` action streams paragraphs into the chapter document;
       │     the client's `useQuery` subscription renders each paragraph as it lands.
       │     (Enforces Reading Level Matrix + Arc Role
       │      + Verbatim Tail of Chapter N-1)          → [ LivingStorybookPage.tsx ]
       │                                                (tap any paragraph to Remix)
       ├─ 4. Post-Chapter extraction action (validator-checked JSON):
       │     Updates inventory, summarizes chapter, pre-pitches Chapter N+1 Beat Cards,
       │     and crafts self-contained Visual + Cinemagraph Motion Prompts.
       │
       └─ 5. Media actions (post-v0 for video)
               │
               ├─► Step A: Generate Static Illustration (~3s) ─► chapter.illustration
               │                                                flips UI to `STILL_READY`
               │
               └─► Step B: Is Key Video Chapter?
                     │
                     └──► Call Grok Video (`grok-imagine-video`) or Google Veo
                            │     from a Convex Node action
                            ├─ Poll async job status (~15-30s)
                            ├─ Transcode via external service (no FFmpeg on Convex):
                            │  `libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart -an`
                            ├─ Store the MP4 in Convex file storage
                            └─ chapter.video set ───────► [ Static Picture comes alive! ]
       │
       ├─ 6. Publishing Ceremony:
       │     Child signs their name on canvas (SVG) -> `epub.ts` action zips with JSZip.
       │     v0 ships one lightweight static EPUB; the video EPUB is post-v0.
```
