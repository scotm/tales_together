# 01 — Product Vision & Cross-Screen UX Features

## Core Philosophy: The Child as Director & Co-Author

The magic of **Tales Together** isn't "press a button, get a book"—it is treating the child as the **Director and Co-Author**, while the AI acts as an enthusiastic scribe and illustrator that handles the heavy lifting of prose, continuity, and book formatting.

To make an interactive story-shaping UI genuinely delightful for kids (and parents sitting beside them), **it must never feel like filling out a web form or chatting with a corporate chatbot.** It should feel like playing with a magical, tactile toy box—chunky, responsive, visual, and forgiving.

---

## 1. Feature Pillars

### 1.1 The World-Building & Character Forge (Pre-Story)
Instead of giving kids blank text boxes (which cause "blank page paralysis"), setup feels like rolling a character in an RPG mixed with a physical toy box:

* **The "Padlock" World Slot Machine:**
  * Present the story premise as 3 big spinning arcade reels: **Where** (*An Underwater Teapot Bakery*) + **The Trouble** (*The Royal Sponge Cake Floated Away*) + **The Vibe** (*Silly & Bonkers*).
  * Give each reel its own chunky **🔒 Padlock Toggle**. A child can lock the one reel they already love and keep pulling the **SPIN!** lever to randomise only the unlocked reels until a hilarious combination appears.
* **"Bring Your Real Toy into the Book!" (Vision Camera Magic):**
  * Kids can tap **📸 Snap Your Real Toy or Drawing!** and hold up their favourite stuffed animal, LEGO minifigure, or crayon monster to the camera.
  * A fast Vision LLM extracts a canonical visual description, suggests a funny personality quirk, and uses the photo to generate a watercolour character reference sheet so their real-world toy stars in the book and animated chapter videos.
* **Peel-and-Stick "Quirk Stickers" on a Live 3D Trading Card:**
  * Give characters a role (*The Brave Sibling, The Grumpy Pet, The Clockwork Robot*), a silly outfit, and a sheet of vinyl **Quirk Stickers** (*Hiccups Rainbow Bubbles*, *Terrified of Broccoli*, *Speaks Fluent Squirrel*).
  * Tapping a sticker peels it off the sheet and slaps it onto the corner of their **Live Character Trading Card** with spring physics.
* **The Two-Part "Silly Name-O-Matic":**
  * Toggle between typing a custom name (for naming the hero after themselves or a pet) and spinning a two-wheel name generator (*Captain / Professor / Barnaby* + *Wobblebottom / Whiskers / McSplat*).
* **The Bulging 3-Pocket Backpack & Conveyor Belt:**
  * Before Chapter 1 begins, the child packs their hero's canvas backpack with **3 items** from a scrolling conveyor belt (e.g., *Golden Whisk*, *Jar of Glow-Jam*, *Grandma's Kazoo*).
  * The backend state machine tracks these items across chapters, ensuring they are used to solve problems later in the plot.

### 1.2 The Interactive Chapter-by-Chapter Co-Pilot
Asking an LLM to write a 5-chapter book in a single prompt results in rushed pacing and shallow plots. Breaking generation into a chapter-by-chapter loop solves the LLM pacing problem *and* turns writing into a game:

* **The "Story Beat" Tarot Pitch Board:** Before generating a chapter, the AI deals 3 illustrated tarot-style cards onto the screen with distinct plot directions:
  * ⚔️ **The Bold Move (Action):** *"Barnaby tries to ride the giant vacuum cleaner."*
  * 🧠 **The Sneaky Plan (Clever/Item Use):** *"Barnaby disguises himself as a dust bunny using the Golden Whisk."*
  * 🤪 **The Bonkers Twist (Surprise):** *"The vacuum cleaner starts talking and asks for help!"*
* **The Giant Red Microphone (Voice-First Wildcard):**
  * Younger kids (ages 4–7) have far more imagination than typing speed. Holding down the pulsing microphone button lets them ramble their own wild idea out loud.
  * Speech-to-Text + a fast guardrail normaliser prompt turns their spoken sentence into a shiny 4th **"👑 Your Royal Idea!"** card.
* **The "Director's Spice Rack" (Pre-Generation Modifiers):**
  * Right before hitting **🪄 Write Chapter!**, the child can flip 2–3 physical switches:
    * **Backpack Check:** Tap an item in the hero's backpack so it glows gold (*"Use this item in this chapter!"*).
    * **Weather / Mood Pill:** *Sunny & Bright*, *Stormy & Wild*, *Spooky Flashlight*, or *Silly Chaos*.
    * **Sound Effects Toggle:** *"Include lots of SPLAT, BOOM, and WHOOSH words!"*
    * **Cliffhanger Meter:** *End on a Surprise Cliffhanger* vs. *End on a Cosy Breather*.
* **Interactive Revision ("The Magic Wand"):**
  * After a chapter streams in, tapping any paragraph opens a floating radial/bar menu of revision wands that rewrite *only* that paragraph in ~1.5 seconds:
    * 😂 **Funnier** (injects slapstick or character quirk reactions)
    * 🗣️ **More Talking** (converts narration into snappy dialogue)
    * 🔍 **Describe More** (adds kid-friendly sensory details)
    * 🧸 **Make Friendly** (softens scary tension into something silly)

### 1.3 Age-Adaptive Reading & Pedagogical Features
A 5-year-old, an 8-year-old, and an 11-year-old require completely different linguistic structures:

* **Granular Reading Level Engine:**
  * **Early Reader (Ages 4–6):** Short sentences (max 12 words), heavy repetition, onomatopoeia, 3–4 short chapters, concrete physical actions.
  * **Early Chapter Book (Ages 7–9):** *Magic Treehouse* / *Roald Dahl* cadence. 5–6 chapters, high dialogue ratio (40%+), humorous comparisons, mild cliffhangers.
  * **Middle Grade (Ages 10–12):** Richer vocabulary, witty narrator voice, internal thoughts, clever puzzle mechanics, 6–10 longer chapters.
* **Stealth Vocabulary Builder ("Word Treasure"):**
  * Parents or kids can select 3–5 "Challenge Words" (or pull from a school spelling list) to weave naturally into the story.
  * In the generated EPUB 3, these words use native `epub:type="noteref"` pop-up footnotes so tapping a word on an iPad, Kindle, or Kobo opens a floating definition card!
* **Bilingual / Language Learning Mode:**
  * Option to weave target-language phrases naturally through a bilingual sidekick or dual-language paragraphs.
* **Dyslexia-Friendly Mode:**
  * One-click toggle in the web reader *and* embedded in the EPUB 3 CSS using **Lexend** / **OpenDyslexic**, generous line height (`1.65`), wider margins, and warm cream/parchment backgrounds.

### 1.4 Visuals, "Living Pictures" (Video), & Audio Enhancements
* **Consistent Character Seeds & Style Locks:**
  * Choose an art style at the start (*Warm Watercolour Storybook*, *Quentin Blake Ink & Wash*, *Pixel Art*, *Claymation*, or *Black & White Colouring Book Mode* for iPad Apple Pencil colouring).
* **3-Stage "Living Illustrations" (Grok Video / Google Veo):**
  * For key chapters (Chapter 1 Opening, Midpoint Climax, Grand Finale), the chapter header starts with a playful painting animation while the child begins reading $\rightarrow$ cross-fades into a static watercolour illustration in ~3 seconds $\rightarrow$ shimmers with golden sparkles and transitions into a looping 5-second **cinemagraph MP4 video** once the background Image-to-Video + FFmpeg pipeline finishes.
  * Embedded directly into the **EPUB 3** via progressive-enhancement HTML5 `<video>` tags (playing inline in Apple Books/tablets and falling back automatically to the static `<img>` on e-ink Kindles).
* **Read-Aloud & Zero-Reading UI Accessibility:**
  * Every UI card, trait sticker, and recap banner includes a 🔊 speaker button so pre-readers can tap to hear options before choosing.

### 1.5 Heirloom EPUB Output & Series Continuity
* **The Publishing Ceremony & Handwritten SVG Signature:**
  * When the final chapter is complete, the child signs their name with their finger or Apple Pencil on a digital parchment pad. The stroke paths are saved as clean inline `<svg>` markup and embedded directly onto the EPUB's Title Page (`Published by [Child's Name] Press`).
* **The "Behind the Scenes: Director's Notes" Appendix:**
  * Automatically compiled at the back of every EPUB: Trading-Card bios of the characters they invented, plus a chapter-by-chapter log of the exact plot cards and backpack items the child chose—serving as a permanent keepsake for parents.
* **"Write Book 2!" (The Series Bible):**
  * Characters, quirks, world rules, and past book summaries persist in the database so families can turn their hero into a multi-book bedtime series with callbacks to earlier adventures.

---

## 2. Adaptive Layout Philosophy Across Screens

Instead of shrinking a desktop layout onto a phone, each device class leans into its natural physical posture:

| Device Class | Physical Posture | Layout Pattern | Core Interaction Style |
| :--- | :--- | :--- | :--- |
| **Mobile (Phone)** | One-handed parent hold or two-thumb kid hold; often on the go. | **Deck of Cards & Bottom Sheets.** Full-screen vertical steps; one decision per screen. | Swipe left/right to browse choices, tap to lock in, hold-to-talk big microphone button. |
| **Tablet (iPad / Android)** | Co-op "couch mode" (parent + child side-by-side) or propped on a stand. | **The Open Storybook (Split View).** Left page is the live book/illustration; Right page is the "Director's Control Deck". | Drag-and-drop tokens into the book, two-player simultaneous tapping, Apple Pencil signature & colouring. |
| **Desktop / Laptop** | "Creator Studio" mode at a desk; older kids typing or families casting to a TV. | **Three-Pane Workbench.** Left: Cast & Backpack drawer; Centre: The Book Canvas; Right: Chapter Outline & AI Co-Pilot. | Hover states, keyboard shortcuts, click-to-highlight text editing, live multi-chapter stepping-stone map. |

---

## 3. Micro-Interactions & Bedtime Hygiene

* **Physical Push-Button Physics:** Every button, card, and backpack item uses a chunky 3D bottom border (`border-b-[6px] active:border-b-2 active:translate-y-[4px]`) paired with subtle mobile haptics (`navigator.vibrate(15)`) so every tap feels like pressing a physical arcade or board-game piece.
* **Calm Bedtime Mode (🌙 Moon Switch):** A single toggle in the top header shifts the entire UI from bright parchment (`#FDF6E3`) to deep starry-night slate (`bg-slate-950 text-amber-100`), slows down spring animations, and lowers read-aloud TTS speech rate (`0.88x`) so the app helps kids wind down before sleep rather than wiring them up.
* **Save & Resume as a Bedtime Serial:** Families can write one chapter per night. Opening the app on night two pulls a cosy bookmark ribbon straight into a *"Previously on..."* recap card before dealing the next chapter's 3 Tarot Cards.
