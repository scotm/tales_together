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

2. **[02 — Backend State Machine & Multimodal Video Pipeline](./02-backend-and-video-pipeline.md)**
   * Canonical `StoryState` JSON Architecture
   * Chapter Lifecycle Finite State Machine (FSM)
   * Django Relational + JSON Models (`Story`, `Character`, `Chapter`)
   * Pydantic Schemas for Structured LLM Outputs
   * Vision "Snap Your Real Toy" Character Scanner (`ScannedToyCharacterSheet`)
   * Celery Async Media Pipeline (Static Illustration $\rightarrow$ Grok/Veo Image-to-Video $\rightarrow$ FFmpeg H.264 `faststart` Optimisation)
   * Cost & Unit-Economics Guardrails ("Magic Living Picture Tickets")

3. **[03 — Prompt Engineering & Pacing Matrices](./03-prompt-engineering-templates.md)**
   * Granular Reading Level Matrix (`AGES_4_6`, `AGES_7_9`, `AGES_10_12`)
   * Deterministic Story Arc Pacing Engine (`get_arc_role_instructions`)
   * Global "Anti-Slop" & Kid-Safe Guardrail System Preamble
   * **Prompt 1:** The Voice-Wildcard Normaliser (Child Audio $\rightarrow$ Story Card)
   * **Prompt 2:** The Chapter Beat Pitcher (Generating the 3 Tarot Cards)
   * **Prompt 3:** The Core Chapter Prose Generator (Streaming with Verbatim Continuity Anchor & Spice Rack Modifiers)
   * **Prompt 4:** Post-Chapter State Extractor & Visual/Video Cinematographer
   * **Prompt 5:** Surgical "Magic Wand" Paragraph Remixer
   * Zero-Latency Pre-Generation & Automated Quality Linting

4. **[04 — Interactive React Frontend Components](./04-frontend-react-components.md)**
   * Tactile Design System & Micro-Interaction Hook (`useTactileFeedback.ts`)
   * Client-Side State Machine (`useStoryDirectorStore.ts` with Zustand)
   * The Toy Box Catalogue (`toyBoxCatalog.ts`)
   * The Toy Box & Character Creator (`ToyBoxCreator.tsx` — Padlock Slot Machine, 3D Trading Card, Peel-and-Stick Quirk Stickers, Real-Toy Camera Scanner, 3-Pocket Backpack Conveyor Belt)
   * Adaptive Cross-Screen Workbench (`StorybookWorkbench.tsx`)
   * The Chapter Director's Chair (`DirectorsChair.tsx`)
   * The Tactile Backpack Drawer (`BackpackDrawer.tsx`)
   * The Living Storybook Page (`LivingStorybookPage.tsx` — 3-Stage Media Frame & Magic Wand Paragraph Remixing)

5. **[05 — Deterministic EPUB 3 Compiler & XHTML/CSS Templates](./05-epub3-compiler-and-templates.md)**
   * Why Custom `zipfile` + `Jinja2` Beats Legacy Libraries
   * EPUB 3 Archive Structure & Byte-Order Rules
   * Progressive Enhancement `<video>` Across Apple Books, Readium, and Kindle E-Ink
   * Complete `Epub3Compiler` Python Service
   * `storybook.css` (Drop Caps, Dyslexia-Friendly Typography, Unbreakable Media Frames, Night-Mode Support)
   * `chapter.xhtml` (HTML5 `<video>` with `<img>` Fallback & Native EPUB 3 Pop-Up Vocabulary Footnotes)
   * `titlepage.xhtml` (With Embedded Child SVG Handwritten Signature)
   * `appendix.xhtml` (Character Trading Cards & "Behind the Scenes: Director's Notes")
   * `content.opf`, `nav.xhtml`, `container.xml`, and Automated `pytest` Validation

**[Decisions & gotchas](./decisions.md)** — append-only log of vendor choices, verified API sharp
edges, and open platform questions. Read before adding infrastructure.

---

## 🏗️ High-Level System Flow

```text
[ Child + Parent UI (React / Next.js / Expo) ]
       │
       ├─ 1. Toy Box Setup: Spins Padlock World Reels, builds Hero Trading Card,
       │     snaps photo of real toy, and packs 3 items into the Backpack.
       │
       ├─ 2. Director's Chair (Loop x5 Chapters):
       │     Picks 1 of 3 Tarot Beat Cards (or holds Giant Red Mic for a Wildcard)
       │     + toggles Spice Rack modifiers ("Use Golden Whisk", "Stormy", "Cliffhanger").
       ▼
[ Django API & Deterministic State Machine ]
       │
       ├─ 3. Streams Chapter Prose via SSE ────────────────► [ LivingStorybookPage.tsx ]
       │     (Enforces Reading Level Matrix + Arc Role          (Child starts reading immediately;
       │      + Verbatim Tail of Chapter N-1)                    can tap any paragraph to Remix)
       │
       ├─ 4. Post-Chapter Hook (Pydantic Extraction):
       │     Updates inventory, summarizes chapter, pre-pitches Chapter N+1 Beat Cards,
       │     and crafts self-contained Visual + Cinemagraph Motion Prompts.
       │
       └─ 5. Dispatches Async Media Pipeline (Celery)
               │
               ├─► Step A: Generate Static Illustration (~3s) ─► Pushes `STILL_READY` to UI
               │
               └─► Step B: Is Key Video Chapter?
                     │
                     └──► Call Grok Video (`grok-imagine-video`) or Google Veo (Image-to-Video)
                            │
                            ├─ Poll async job status (~15-30s)
                            ├─ Run FFmpeg (`libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart -an`)
                            ├─ Stage in Object Storage for EPUB 3 Compiler
                            └─ Push `VIDEO_READY` to UI ───────► [ Static Picture comes alive! ]
       │
       ├─ 6. Publishing Ceremony:
       │     Child signs their name on canvas (SVG) -> `Epub3Compiler` packages
       │     Deluxe Living EPUB (with MP4s) & Lightweight E-Ink EPUB in milliseconds.
```
