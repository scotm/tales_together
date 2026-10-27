# 04 — Interactive React Frontend Components

## 1. Frontend Stack & Design Principles

* **Framework:** React + TypeScript (Next.js for web; Expo / React Native for native tablet apps).
* **Styling:** Tailwind CSS with a "chunky physical push-button" utility pattern.
* **Animation:** `framer-motion` (web) / `react-native-reanimated` (Expo) for spring physics, card flips, and media cross-fades.
* **State:** `zustand` for the client-side story director state machine; `TanStack Query` for server data.
* **Real-Time:** Server-Sent Events (SSE) for streaming chapter prose + WebSocket/SSE events for async media readiness (`ILLUSTRATION_READY`, `VIDEO_READY`).

### The Tactile Push-Button Pattern
Instead of flat buttons, every card, backpack item, and toggle uses a physical 3D "depress" pattern so the UI feels like a board game under a child's thumb:

* **Resting state:** `border-2 border-stone-900 border-b-[6px] translate-y-0`
* **Pressed state:** `active:border-b-2 active:translate-y-[4px] transition-all duration-75`

---

## 2. Micro-Interaction Hook (`useTactileFeedback.ts`)

Gives every tap a physical sensation (mobile haptics) plus instant read-aloud for pre-readers who cannot yet read the UI cards.

```tsx
// src/hooks/useTactileFeedback.ts
import { useCallback } from "react";

export function useTactileFeedback(calmMode = false) {
  const triggerHaptic = useCallback((pattern: number | number[] = 15) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Zero-latency Read-Aloud for Pre-Readers (local SpeechSynthesis, or swap for cached neural TTS)
  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = calmMode ? 0.88 : 0.95; // Slightly slower & calmer at bedtime
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }, [calmMode]);

  return { triggerHaptic, speakText };
}
```

---

## 3. Client-Side State Machine (`useStoryDirectorStore.ts`)

Coordinates the Director's Chair, Backpack Inventory, SSE Paragraph Stream, and the 3-Stage Media Upgrade (`PAINTING` $\rightarrow$ `STILL_READY` $\rightarrow$ `VIDEO_READY`).

```tsx
// src/store/useStoryDirectorStore.ts
import { create } from "zustand";

export type BeatStyle = "BOLD_ACTION" | "CLEVER_TRICK" | "SILLY_TWIST" | "KID_WILDCARD";
export type MediaStage = "PAINTING" | "STILL_READY" | "VIDEO_READY";
export type RemixMode = "MAKE_FUNNIER" | "MORE_DIALOGUE" | "ADD_SENSORY" | "LESS_SCARY";

// NAMING CONVENTION: the frontend store uses camelCase (cardId, kidFriendlyPitch, useItemId).
// The Django API speaks snake_case (card_id, kid_friendly_pitch, use_item_id) — see the
// StoryBeatCard / DirectorModifiers Pydantic schemas in 02-backend-and-video-pipeline.md.
// The conversion happens once, at the API boundary (e.g. djangorestframework-camel-case or a
// thin fetch wrapper), so neither side ever mixes conventions.
export interface StoryBeatCard {
  cardId: string;
  style: BeatStyle;
  title: string;
  kidFriendlyPitch: string;
  iconEmoji: string;
  suggestedItemId?: string | null;
}

export interface BackpackItem {
  id: string;
  name: string;
  emoji: string;
  status: "IN_BACKPACK" | "RESERVED_THIS_CHAPTER" | "USED";
}

export interface DirectorModifiers {
  useItemId: string | null;
  spotlightCharacterId: string | null;
  weatherOrMood: "SUNNY" | "STORMY" | "SPOOKY_NIGHT" | "BUBBLY_CHAOS" | null;
  soundEffectsBoost: boolean;
  endingStyle: "CLIFFHANGER" | "COZY_PAUSE";
}

interface StoryDirectorState {
  // Global UI Posture
  calmBedtimeMode: boolean;
  toggleCalmMode: () => void;

  // Chapter State Machine
  chapterIndex: number;
  totalChapters: number;
  phase: "DIRECTING" | "STREAMING_PROSE" | "REVIEWING";
  recapOneLiner: string;

  // Director's Chair State
  beatCards: StoryBeatCard[];
  selectedCardId: string | null;
  backpack: BackpackItem[];
  modifiers: DirectorModifiers;

  // Live Reading & Media State
  chapterTitle: string;
  paragraphs: string[];
  remixingParagraphIndex: number | null;
  mediaStage: MediaStage;
  illustrationUrl: string | null;
  videoUrl: string | null;

  // Actions
  selectBeatCard: (cardId: string) => void;
  addWildcardBeat: (card: StoryBeatCard) => void;
  toggleBackpackItemForChapter: (itemId: string) => void;
  updateModifier: <K extends keyof DirectorModifiers>(key: K, value: DirectorModifiers[K]) => void;

  // Streaming & WebSocket Handlers
  startChapterStream: () => void;
  appendStreamedParagraph: (paragraph: string) => void;
  replaceRemixedParagraph: (index: number, newText: string) => void;
  setIllustrationReady: (url: string) => void;
  setVideoReady: (url: string) => void;
}

export const useStoryDirectorStore = create<StoryDirectorState>((set) => ({
  calmBedtimeMode: false,
  toggleCalmMode: () => set((s) => ({ calmBedtimeMode: !s.calmBedtimeMode })),

  chapterIndex: 2,
  totalChapters: 5,
  phase: "DIRECTING",
  recapOneLiner: "Previously: Barnaby chased the floating Royal Sponge Cake into the Kelp Forest!",

  beatCards: [],
  selectedCardId: null,
  backpack: [
    { id: "item_1", name: "Golden Whisk", emoji: "✨", status: "IN_BACKPACK" },
    { id: "item_2", name: "Glow-Jam Jar", emoji: "🫙", status: "IN_BACKPACK" },
    { id: "item_3", name: "Grandma's Kazoo", emoji: "🎺", status: "USED" },
  ],
  modifiers: {
    useItemId: null,
    spotlightCharacterId: null,
    weatherOrMood: null,
    soundEffectsBoost: true,
    endingStyle: "CLIFFHANGER",
  },

  chapterTitle: "",
  paragraphs: [],
  remixingParagraphIndex: null,
  mediaStage: "PAINTING",
  illustrationUrl: null,
  videoUrl: null,

  selectBeatCard: (cardId) =>
    set((state) => {
      const card = state.beatCards.find((c) => c.cardId === cardId);
      const suggestedItem = card?.suggestedItemId || state.modifiers.useItemId;
      return {
        selectedCardId: cardId,
        modifiers: { ...state.modifiers, useItemId: suggestedItem ?? null },
        backpack: state.backpack.map((item) =>
          item.status === "USED"
            ? item
            : {
                ...item,
                status: item.id === suggestedItem ? "RESERVED_THIS_CHAPTER" : "IN_BACKPACK",
              }
        ),
      };
    }),

  addWildcardBeat: (card) =>
    set((state) => ({
      beatCards: [...state.beatCards.filter((c) => c.style !== "KID_WILDCARD"), card],
      selectedCardId: card.cardId,
    })),

  toggleBackpackItemForChapter: (itemId) =>
    set((state) => {
      const isCurrentlySelected = state.modifiers.useItemId === itemId;
      const nextItemId = isCurrentlySelected ? null : itemId;
      return {
        modifiers: { ...state.modifiers, useItemId: nextItemId },
        backpack: state.backpack.map((item) =>
          item.status === "USED"
            ? item
            : {
                ...item,
                status: item.id === nextItemId ? "RESERVED_THIS_CHAPTER" : "IN_BACKPACK",
              }
        ),
      };
    }),

  updateModifier: (key, value) =>
    set((state) => ({ modifiers: { ...state.modifiers, [key]: value } })),

  startChapterStream: () =>
    set({ phase: "STREAMING_PROSE", paragraphs: [], mediaStage: "PAINTING" }),

  appendStreamedParagraph: (paragraph) =>
    set((state) => ({ paragraphs: [...state.paragraphs, paragraph] })),

  replaceRemixedParagraph: (index, newText) =>
    set((state) => {
      const updated = [...state.paragraphs];
      updated[index] = newText;
      return { paragraphs: updated, remixingParagraphIndex: null };
    }),

  setIllustrationReady: (url) => set({ illustrationUrl: url, mediaStage: "STILL_READY" }),
  setVideoReady: (url) => set({ videoUrl: url, mediaStage: "VIDEO_READY" }),
}));
```

---

## 4. The Toy Box Catalogue (`toyBoxCatalog.ts`)

Every kid-friendly button carries a hidden `promptFragment`. While the child taps **🦦 Otter** + **👨‍🍳 Crooked Chef Hat** + **🫧 Hiccups Bubbles**, the frontend deterministically assembles the canonical `visual_description` string that keeps image and video models consistent across all chapters.

```tsx
// src/data/toyBoxCatalog.ts

export interface CatalogOption {
  id: string;
  label: string;
  emoji: string;
  promptFragment: string;
}

export const WORLD_SETTINGS: CatalogOption[] = [
  {
    id: "set_bakery",
    label: "Underwater Teapot Bakery",
    emoji: "🫖",
    promptFragment: "An underwater bakery inside a giant sunken porcelain teapot surrounded by glowing coral",
  },
  {
    id: "set_treehouse",
    label: "Cloud-Top Treehouse Express",
    emoji: "🌳",
    promptFragment: "A brass-and-wood steam train that drives along giant branches of a mile-high cloud tree",
  },
  {
    id: "set_museum",
    label: "Midnight Dinosaur Museum",
    emoji: "🦖",
    promptFragment: "A grand museum at midnight where the dinosaur skeletons and exhibits come alive when the clock strikes twelve",
  },
  {
    id: "set_moon",
    label: "Cheese-Crater Moon Camp",
    emoji: "🧀",
    promptFragment: "A cosy space station built inside a giant yellow Swiss-cheese crater on the Moon",
  },
];

export const WORLD_PROBLEMS: CatalogOption[] = [
  {
    id: "prob_cake",
    label: "The Royal Cake Floated Away!",
    emoji: "🎂",
    promptFragment: "The giant triple-decker Royal Sponge Cake has grown wings and floated out the chimney right before the Queen's party",
  },
  {
    id: "prob_gravity",
    label: "Someone Turned Off Gravity!",
    emoji: "🎈",
    promptFragment: "The town's Gravity Switch has gone missing and everyone's furniture, pets, and teacups are floating toward the ceiling",
  },
  {
    id: "prob_map",
    label: "The Whispering Treasure Map",
    emoji: "🗺️",
    promptFragment: "They found a mysterious rolled-up map in the attic that giggles and gives riddles leading to a hidden vault",
  },
  {
    id: "prob_monster",
    label: "A Grumpy Monster Under the Bed",
    emoji: "👾",
    promptFragment: "A fuzzy purple monster moved into the pantry because he lost his favourite teddy bear and won't stop snoring loudly",
  },
];

export const HERO_ARCHETYPES: CatalogOption[] = [
  {
    id: "hero_otter",
    label: "Scruffy River Otter",
    emoji: "🦦",
    promptFragment: "a small scruffy brown river otter with bright curious eyes and long whiskers",
  },
  {
    id: "hero_badger",
    label: "Grumpy Little Badger",
    emoji: "🦡",
    promptFragment: "a stout, slightly grumpy black-and-white woodland badger with fluffy ears",
  },
  {
    id: "hero_robot",
    label: "Rusty Clockwork Robot",
    emoji: "🤖",
    promptFragment: "a small round copper clockwork robot with glowing warm lightbulb eyes and a wind-up key on its back",
  },
  {
    id: "hero_kid",
    label: "Brave Kid Explorer",
    emoji: "🧒",
    promptFragment: "an energetic 8-year-old child explorer with messy hair, plaster on one knee, and a wide grin",
  },
];

export const HERO_OUTFITS: CatalogOption[] = [
  {
    id: "out_chef",
    label: "Crooked Chef Hat & Polka-Dot Apron",
    emoji: "👨‍🍳",
    promptFragment: "wearing a tall crooked white chef hat and a red polka-dot apron dusted with flour",
  },
  {
    id: "out_detective",
    label: "Oversized Detective Coat & Cape",
    emoji: "🕵️",
    promptFragment: "wearing an oversized checkered detective coat and carrying a brass magnifying glass",
  },
  {
    id: "out_space",
    label: "Cardboard & Tin-Foil Spacesuit",
    emoji: "👩‍🚀",
    promptFragment: "wearing a homemade silver tin-foil spacesuit with a fishbowl helmet and colourful buttons",
  },
  {
    id: "out_pajamas",
    label: "Glow-in-the-Dark Dinosaur Pyjamas",
    emoji: "🦕",
    promptFragment: "wearing cosy green dinosaur onesie pyjamas with fabric spikes down the hood and fuzzy slippers",
  },
];

export const QUIRK_STICKERS: CatalogOption[] = [
  {
    id: "quirk_bubbles",
    label: "Hiccups Rainbow Bubbles",
    emoji: "🫧",
    promptFragment: "Hiccups floating rainbow bubbles whenever they get nervous or excited",
  },
  {
    id: "quirk_squirrels",
    label: "Speaks Fluent Squirrel",
    emoji: "🐿️",
    promptFragment: "Can chatter, squeak, and negotiate with any woodland creature or tiny bug",
  },
  {
    id: "quirk_broccoli",
    label: "Terrified of Broccoli",
    emoji: "🥦",
    promptFragment: "Brave against giant monsters, but dramatically faints at the sight of green vegetables",
  },
  {
    id: "quirk_pockets",
    label: "Bottomless Snacks in Pockets",
    emoji: "🥨",
    promptFragment: "Always pulls half-melted biscuits or cheese crackers out of their pockets at the worst moment",
  },
];

export const CONVEYOR_ITEMS: CatalogOption[] = [
  { id: "item_whisk", label: "Golden Whisk", emoji: "✨", promptFragment: "A glowing golden baking whisk" },
  { id: "item_jam", label: "Jar of Glow-Jam", emoji: "🫙", promptFragment: "A jar of neon-purple glowing berry jam" },
  { id: "item_kazoo", label: "Grandma's Kazoo", emoji: "🎺", promptFragment: "A loud brass kazoo that echoes" },
  { id: "item_boot", label: "Spring-Loaded Boot", emoji: "🥾", promptFragment: "A single mechanical boot with a giant coiled spring" },
  { id: "item_umbrella", label: "Inside-Out Umbrella", emoji: "☂️", promptFragment: "A striped umbrella that floats like a parachute" },
  { id: "item_tape", label: "Unstoppable Sticky Tape", emoji: "🧻", promptFragment: "A roll of sparkly silver tape that can stick anything to the ceiling" },
];

export const FIRST_NAMES = ["Barnaby", "Professor", "Captain", "Pippa", "Inspector", "Ziggy", "Lady", "Bramble"];
export const SECOND_NAMES = ["Wobblebottom", "Whiskers", "McSplat", "Pickle-Paws", "Fizzle", "Bounce", "Star-Jumper", "Crumb"];
```

---

## 5. The Toy Box & Character Creator (`ToyBoxCreator.tsx`)

The front door of the app. Combines:
* **Left (Sticky):** The **Live 3D Character Trading Card** updating in real time with stuck-on Quirk Stickers and a 3-pocket backpack preview.
* **Right:** Three playful stations — the **Padlock World Slot Machine**, the **Character Forge** (Name-O-Matic, species, outfit, sticker sheet, "Snap Your Real Toy" camera button), and the **3-Pocket Backpack Conveyor Belt**.

```tsx
// src/components/ToyBoxCreator.tsx
import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  WORLD_SETTINGS,
  WORLD_PROBLEMS,
  HERO_ARCHETYPES,
  HERO_OUTFITS,
  QUIRK_STICKERS,
  CONVEYOR_ITEMS,
  FIRST_NAMES,
  SECOND_NAMES,
  CatalogOption,
} from "../data/toyBoxCatalog";
import { useTactileFeedback } from "../hooks/useTactileFeedback";

export interface ToyBoxLaunchPayload {
  world_state: {
    setting: string;
    central_problem: string;
    inventory: Array<{
      id: string;
      name: string;
      emoji: string;
      prompt_fragment: string;
      status: "IN_BACKPACK";
    }>;
    unresolved_threads: string[];
  };
  protagonist: {
    name: string;
    role: "PROTAGONIST";
    quirk: string;
    visual_description: string;
    real_toy_photo_url: string | null;
  };
}

export const ToyBoxCreator: React.FC<{ onLaunchStory: (payload: ToyBoxLaunchPayload) => void }> = ({
  onLaunchStory,
}) => {
  const { triggerHaptic, speakText } = useTactileFeedback();

  // --- 1. WORLD SLOT MACHINE STATE (with Individual Padlocks!) ---
  const [settingIdx, setSettingIdx] = useState(0);
  const [problemIdx, setProblemIdx] = useState(0);
  const [lockedSetting, setLockedSetting] = useState(false);
  const [lockedProblem, setLockedProblem] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  // --- 2. CHARACTER FORGE STATE ---
  const [firstName, setFirstName] = useState("Barnaby");
  const [secondName, setSecondName] = useState("Whiskers");
  const [customNameMode, setCustomNameMode] = useState(false);
  const [customNameInput, setCustomNameInput] = useState("");

  const [archetype, setArchetype] = useState<CatalogOption>(HERO_ARCHETYPES[0]);
  const [outfit, setOutfit] = useState<CatalogOption>(HERO_OUTFITS[0]);
  const [quirk, setQuirk] = useState<CatalogOption>(QUIRK_STICKERS[0]);
  const [realToyPhotoUrl, setRealToyPhotoUrl] = useState<string | null>(null);

  // --- 3. 3-POCKET BACKPACK STATE ---
  const [packedItems, setPackedItems] = useState<CatalogOption[]>([
    CONVEYOR_ITEMS[0],
    CONVEYOR_ITEMS[1],
  ]);

  const heroFullName = customNameMode && customNameInput.trim()
    ? customNameInput.trim()
    : `${firstName} ${secondName}`;

  // Deterministically assemble the exact visual prompt for Grok/Veo consistency!
  const canonicalVisualPrompt = useMemo(() => {
    return `${archetype.promptFragment}, ${outfit.promptFragment}`;
  }, [archetype, outfit]);

  // --- ACTIONS ---
  const handleSpinWorld = () => {
    if (lockedSetting && lockedProblem) return;
    triggerHaptic([20, 30, 20, 40]);
    setIsSpinning(true);

    setTimeout(() => {
      if (!lockedSetting) {
        setSettingIdx((prev) => (prev + 1 + Math.floor(Math.random() * (WORLD_SETTINGS.length - 1))) % WORLD_SETTINGS.length);
      }
      if (!lockedProblem) {
        setProblemIdx((prev) => (prev + 1 + Math.floor(Math.random() * (WORLD_PROBLEMS.length - 1))) % WORLD_PROBLEMS.length);
      }
      setIsSpinning(false);
    }, 320);
  };

  const handleSpinName = () => {
    triggerHaptic(15);
    const nextFirst = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const nextSecond = SECOND_NAMES[Math.floor(Math.random() * SECOND_NAMES.length)];
    setFirstName(nextFirst);
    setSecondName(nextSecond);
    speakText(`${nextFirst} ${nextSecond}`);
  };

  const handleTogglePackItem = (item: CatalogOption) => {
    const exists = packedItems.some((i) => i.id === item.id);
    if (exists) {
      triggerHaptic(10);
      setPackedItems((prev) => prev.filter((i) => i.id !== item.id));
    } else if (packedItems.length < 3) {
      triggerHaptic([15, 35]);
      setPackedItems((prev) => [...prev, item]);
      speakText(`Packed ${item.label}!`);
    } else {
      // Bag is full! Shake feedback
      triggerHaptic([40, 40, 40]);
      speakText("Your backpack is full! Tap an item in a pocket to swap it out.");
    }
  };

  // "Snap Your Real Toy!" -> In production, POST the file to /api/characters/scan-toy/
  // which runs the Vision LLM (ScannedToyCharacterSheet) and returns a pre-filled card.
  const handleToyPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setRealToyPhotoUrl(previewUrl);
    triggerHaptic([25, 50, 25]);
    speakText("Awesome! Putting your real toy right into the storybook!");
  };

  const currentSetting = WORLD_SETTINGS[settingIdx];
  const currentProblem = WORLD_PROBLEMS[problemIdx];
  const isBagFull = packedItems.length === 3;

  return (
    <div className="min-h-screen bg-[#FDF6E3] text-stone-900 p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* =====================================================================
            LEFT COLUMN (STICKY): THE LIVE 3D SHINY CHARACTER TRADING CARD
           ===================================================================== */}
        <div className="lg:col-span-5 lg:sticky lg:top-8 space-y-5">
          <motion.div
            layout
            className="relative rounded-[32px] p-6 bg-gradient-to-br from-amber-300 via-yellow-100 to-orange-200 border-4 border-stone-900 shadow-[0_10px_0_#1c1917] overflow-hidden"
          >
            {/* Card Header: Name & Role */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-stone-900 text-amber-300">
                  ⭐ Main Hero Card
                </span>
                <h2 className="text-2xl sm:text-3xl font-black mt-1 leading-tight">
                  {heroFullName}
                </h2>
              </div>
              <button
                onClick={() =>
                  speakText(
                    `${heroFullName}. ${archetype.label}, ${outfit.label}. Special quirk: ${quirk.label}!`
                  )
                }
                className="w-10 h-10 rounded-full bg-white border-2 border-stone-900 border-b-4 flex items-center justify-center text-lg active:translate-y-0.5"
                title="Read my card out loud"
              >
                🔊
              </button>
            </div>

            {/* Central Portrait Stage (Combines Species + Outfit + Real Toy Photo) */}
            <div className="relative aspect-[4/3] rounded-2xl bg-[#FFFDF9] border-2 border-stone-900 flex flex-col items-center justify-center p-4 shadow-inner overflow-hidden">
              {realToyPhotoUrl ? (
                <img
                  src={realToyPhotoUrl}
                  alt="Child's real toy"
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <motion.div
                  key={`${archetype.id}-${outfit.id}`}
                  initial={{ scale: 0.7, rotate: -6 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className="flex items-center justify-center gap-2 text-6xl sm:text-7xl select-none"
                >
                  <span>{archetype.emoji}</span>
                  <span className="text-3xl font-black text-amber-500">+</span>
                  <span>{outfit.emoji}</span>
                </motion.div>
              )}

              {/* PEEL-AND-STICK VINYL QUIRK STICKER SLAPPED ON THE CORNER! */}
              <motion.div
                key={quirk.id}
                initial={{ scale: 1.6, rotate: -18, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ type: "spring", stiffness: 350, damping: 16 }}
                className="absolute -bottom-1 -right-1 m-3 px-3.5 py-2 rounded-2xl bg-rose-500 text-white border-2 border-white shadow-lg flex items-center gap-1.5 font-extrabold text-xs"
              >
                <span className="text-base">{quirk.emoji}</span>
                <span>{quirk.label}</span>
              </motion.div>
            </div>

            {/* Card Stats: World & Backpack Summary */}
            <div className="mt-4 space-y-2.5 text-xs sm:text-sm bg-white/80 rounded-2xl p-4 border-2 border-stone-900/15">
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentSetting.emoji}</span>
                <span className="font-bold">World:</span>
                <span className="truncate">{currentSetting.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentProblem.emoji}</span>
                <span className="font-bold">Trouble:</span>
                <span className="truncate">{currentProblem.label}</span>
              </div>

              {/* 3 Mini Backpack Pockets on the Card */}
              <div className="pt-2 border-t border-stone-900/10 flex items-center justify-between">
                <span className="font-extrabold flex items-center gap-1">
                  🎒 Backpack ({packedItems.length}/3):
                </span>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((slotIdx) => {
                    const item = packedItems[slotIdx];
                    return (
                      <div
                        key={slotIdx}
                        className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center text-base ${
                          item
                            ? "bg-amber-300 border-stone-900 shadow-sm"
                            : "bg-stone-200/70 border-dashed border-stone-400"
                        }`}
                        title={item?.label || "Empty Pocket"}
                      >
                        {item ? item.emoji : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* =====================================================================
            RIGHT COLUMN: THE 3 PLAYFUL TOY BOX STATIONS
           ===================================================================== */}
        <div className="lg:col-span-7 space-y-8">

          {/* STATION 1: THE PADLOCK WORLD SLOT MACHINE */}
          <section className="p-6 rounded-3xl bg-white border-2 border-stone-900 border-b-[6px] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
                🎰 1. Spin the Story World!
              </h3>
              <button
                onClick={handleSpinWorld}
                className="px-4 py-2 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm border-2 border-stone-900 border-b-4 active:border-b-2 active:translate-y-0.5 flex items-center gap-2"
              >
                <span>🎲 Spin Unlocked Reels!</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* REEL 1: WHERE */}
              <div
                className={`p-4 rounded-2xl border-2 transition ${
                  lockedSetting ? "bg-amber-100/70 border-amber-600" : "bg-stone-50 border-stone-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-500">
                    Where are we?
                  </span>
                  <button
                    onClick={() => {
                      triggerHaptic(10);
                      setLockedSetting(!lockedSetting);
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                      lockedSetting
                        ? "bg-amber-400 text-stone-950 border-stone-900"
                        : "bg-white text-stone-600 border-stone-300"
                    }`}
                  >
                    {lockedSetting ? "🔒 Locked" : "🔓 Lock This"}
                  </button>
                </div>

                <motion.div
                  animate={isSpinning && !lockedSetting ? { y: [-12, 12, 0] } : {}}
                  onClick={() => {
                    if (lockedSetting) return;
                    triggerHaptic(10);
                    setSettingIdx((settingIdx + 1) % WORLD_SETTINGS.length);
                  }}
                  className="cursor-pointer flex items-center gap-3 py-2"
                >
                  <span className="text-4xl">{currentSetting.emoji}</span>
                  <span className="font-extrabold text-base leading-snug">{currentSetting.label}</span>
                </motion.div>
              </div>

              {/* REEL 2: THE BIG TROUBLE */}
              <div
                className={`p-4 rounded-2xl border-2 transition ${
                  lockedProblem ? "bg-amber-100/70 border-amber-600" : "bg-stone-50 border-stone-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-500">
                    What went wrong?
                  </span>
                  <button
                    onClick={() => {
                      triggerHaptic(10);
                      setLockedProblem(!lockedProblem);
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                      lockedProblem
                        ? "bg-amber-400 text-stone-950 border-stone-900"
                        : "bg-white text-stone-600 border-stone-300"
                    }`}
                  >
                    {lockedProblem ? "🔒 Locked" : "🔓 Lock This"}
                  </button>
                </div>

                <motion.div
                  animate={isSpinning && !lockedProblem ? { y: [-12, 12, 0] } : {}}
                  onClick={() => {
                    if (lockedProblem) return;
                    triggerHaptic(10);
                    setProblemIdx((problemIdx + 1) % WORLD_PROBLEMS.length);
                  }}
                  className="cursor-pointer flex items-center gap-3 py-2"
                >
                  <span className="text-4xl">{currentProblem.emoji}</span>
                  <span className="font-extrabold text-base leading-snug">{currentProblem.label}</span>
                </motion.div>
              </div>
            </div>
          </section>

          {/* STATION 2: THE CHARACTER FORGE & STICKER SHEET */}
          <section className="p-6 rounded-3xl bg-white border-2 border-stone-900 border-b-[6px] space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg sm:text-xl font-black">🧸 2. Build Your Hero!</h3>

              {/* "Snap Your Real Toy" Camera Button */}
              <label className="cursor-pointer px-4 py-2 rounded-2xl bg-sky-400 hover:bg-sky-300 text-stone-950 font-extrabold text-xs sm:text-sm border-2 border-stone-900 border-b-4 active:border-b-2 active:translate-y-0.5 flex items-center gap-2">
                <span>📸 Snap Your Real Toy or Drawing!</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleToyPhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Name-O-Matic Spinner OR Custom Name */}
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-900/15 flex flex-wrap items-center justify-between gap-3">
              {!customNameMode ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase text-amber-800">Hero Name:</span>
                  <span className="px-3 py-1.5 rounded-xl bg-white border-2 border-stone-900 font-black text-base">
                    {firstName} {secondName}
                  </span>
                  <button
                    onClick={handleSpinName}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 text-stone-950 font-extrabold text-xs border-2 border-stone-900 border-b-4 active:border-b-2 active:translate-y-0.5"
                  >
                    🎲 Silly Name Spinner
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  placeholder="Type your hero's name..."
                  className="flex-1 px-4 py-2 rounded-xl bg-white border-2 border-stone-900 font-extrabold text-base"
                />
              )}

              <button
                onClick={() => setCustomNameMode(!customNameMode)}
                className="text-xs font-bold underline text-stone-600 hover:text-stone-900"
              >
                {customNameMode ? "Use Silly Name Spinner" : "✏️ Or type your own name"}
              </button>
            </div>

            {/* Pick Who They Are */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-500 mb-2">
                Who is your hero?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {HERO_ARCHETYPES.map((item) => {
                  const selected = archetype.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        triggerHaptic(15);
                        setArchetype(item);
                        speakText(item.label);
                      }}
                      className={`p-3 rounded-2xl border-2 border-b-4 text-center transition ${
                        selected
                          ? "bg-amber-300 border-stone-900 font-black scale-[1.03]"
                          : "bg-stone-50 border-stone-300 hover:border-stone-500"
                      }`}
                    >
                      <div className="text-3xl mb-1">{item.emoji}</div>
                      <div className="text-xs font-bold leading-tight">{item.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pick What They Wear */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-500 mb-2">
                What are they wearing?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {HERO_OUTFITS.map((item) => {
                  const selected = outfit.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        triggerHaptic(15);
                        setOutfit(item);
                        speakText(item.label);
                      }}
                      className={`p-3 rounded-2xl border-2 border-b-4 text-center transition ${
                        selected
                          ? "bg-sky-200 border-stone-900 font-black scale-[1.03]"
                          : "bg-stone-50 border-stone-300 hover:border-stone-500"
                      }`}
                    >
                      <div className="text-3xl mb-1">{item.emoji}</div>
                      <div className="text-xs font-bold leading-tight">{item.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Peel-and-Stick Quirk Sticker Sheet */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-stone-500 mb-2">
                Slap a Funny Quirk Sticker onto their Card!
              </label>
              <div className="flex flex-wrap gap-3">
                {QUIRK_STICKERS.map((sticker, i) => {
                  const selected = quirk.id === sticker.id;
                  const tilt = i % 2 === 0 ? "-rotate-1" : "rotate-1";
                  return (
                    <button
                      key={sticker.id}
                      onClick={() => {
                        triggerHaptic([15, 30]);
                        setQuirk(sticker);
                        speakText(sticker.label);
                      }}
                      className={`px-4 py-2.5 rounded-2xl border-2 border-b-4 font-extrabold text-xs sm:text-sm flex items-center gap-2 transition transform ${tilt} ${
                        selected
                          ? "bg-rose-500 text-white border-stone-900 scale-105 shadow-md"
                          : "bg-rose-50 text-stone-800 border-rose-300 hover:bg-rose-100"
                      }`}
                    >
                      <span className="text-lg">{sticker.emoji}</span>
                      <span>{sticker.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* STATION 3: THE 3-POCKET BACKPACK CONVEYOR BELT */}
          <section className="p-6 rounded-3xl bg-white border-2 border-stone-900 border-b-[6px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-black flex items-center gap-2">
                🎒 3. Pack 3 Weird Things in Your Backpack!
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black ${
                  isBagFull
                    ? "bg-emerald-400 text-stone-950 border border-stone-900"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                {isBagFull ? "✅ Zipped & Ready!" : `Pick ${3 - packedItems.length} more`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CONVEYOR_ITEMS.map((item) => {
                const isPacked = packedItems.some((i) => i.id === item.id);
                return (
                  <motion.button
                    key={item.id}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleTogglePackItem(item)}
                    className={`p-3.5 rounded-2xl border-2 border-b-4 text-left flex items-center gap-3 transition ${
                      isPacked
                        ? "bg-emerald-300 border-stone-900 font-black shadow-sm"
                        : "bg-stone-50 border-stone-300 hover:border-stone-500"
                    }`}
                  >
                    <span className="text-3xl">{item.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-extrabold leading-tight">{item.label}</div>
                      <div className="text-[11px] opacity-75 font-bold mt-0.5">
                        {isPacked ? "✓ In Pocket!" : "+ Tap to Pack"}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* LAUNCH BUTTON: COMPILES TOY BOX INTO CANONICAL DJANGO PAYLOAD */}
          <button
            onClick={() => {
              triggerHaptic([30, 60, 40]);
              onLaunchStory({
                world_state: {
                  setting: currentSetting.promptFragment,
                  central_problem: currentProblem.promptFragment,
                  inventory: packedItems.map((i) => ({
                    id: i.id,
                    name: i.label,
                    emoji: i.emoji,
                    prompt_fragment: i.promptFragment,
                    status: "IN_BACKPACK",
                  })),
                  unresolved_threads: [currentProblem.label],
                },
                protagonist: {
                  name: heroFullName,
                  role: "PROTAGONIST",
                  quirk: quirk.promptFragment,
                  visual_description: canonicalVisualPrompt,
                  real_toy_photo_url: realToyPhotoUrl,
                },
              });
            }}
            className="w-full py-5 rounded-3xl bg-emerald-400 hover:bg-emerald-300 text-stone-950 font-black text-xl sm:text-2xl border-4 border-stone-900 border-b-[10px] active:border-b-4 active:translate-y-[6px] shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <span>🚀 Open Our Storybook &amp; Start Chapter 1!</span>
          </button>

        </div>
      </div>
    </div>
  );
};
```

### How "Snap Your Real Toy" Connects to the Backend
1. **Vision Extraction:** `POST /api/characters/scan-toy/` sends the photo to `gemini-2.5-flash` or `grok-2-vision` with `response_format=ScannedToyCharacterSheet` (see `02-backend-and-video-pipeline.md`).
2. **Instant UI Update:** The Trading Card updates with the toy's photo, auto-populates `canonical_visual_description`, and slaps the toy's custom Quirk Sticker on the card.
3. **Character Reference Sheet:** In the background, the photo is passed as an image reference with `story.art_style_prompt` (*"Turn this toy into a warm watercolour storybook character portrait"*), saved to `character.reference_image` so the Grok/Veo pipeline can animate the real toy across key chapters.

---

## 6. The Adaptive Cross-Screen Workbench (`StorybookWorkbench.tsx`)

Adapts across **Phone** (single stack + bottom backpack), **Tablet** (open storybook spread), and **Desktop** (three-pane studio), while honouring the **Calm Bedtime Mode** palette.

```tsx
// src/components/StorybookWorkbench.tsx
import React from "react";
import { useStoryDirectorStore } from "../store/useStoryDirectorStore";
import { DirectorsChair } from "./DirectorsChair";
import { LivingStorybookPage } from "./LivingStorybookPage";
import { BackpackDrawer } from "./BackpackDrawer";

export const StorybookWorkbench: React.FC = () => {
  const { calmBedtimeMode, toggleCalmMode, phase, chapterIndex, totalChapters } =
    useStoryDirectorStore();

  const isDirecting = phase === "DIRECTING";

  return (
    <div
      className={`min-h-screen transition-colors duration-700 ${
        calmBedtimeMode
          ? "bg-slate-950 text-amber-100" // Starry Night Bedtime Palette
          : "bg-[#FDF6E3] text-stone-900" // Warm Storybook Parchment Palette
      }`}
    >
      {/* Top Story Map Stepping-Stones Bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b-2 border-amber-900/15 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          {Array.from({ length: totalChapters }, (_, i) => i + 1).map((step) => {
            const isCompleted = step < chapterIndex;
            const isCurrent = step === chapterIndex;
            return (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-transform ${
                    isCurrent
                      ? "bg-amber-400 text-stone-950 border-stone-900 scale-110 shadow-md"
                      : isCompleted
                      ? "bg-emerald-500 text-white border-emerald-700"
                      : "bg-stone-200/60 text-stone-500 border-stone-300"
                  }`}
                >
                  {isCompleted ? "✓" : step}
                </div>
                {step < totalChapters && <div className="w-4 sm:w-8 h-1 rounded bg-amber-900/20" />}
              </div>
            );
          })}
        </div>

        {/* Calm Mode (Bedtime Switch) */}
        <button
          onClick={toggleCalmMode}
          className="px-3 py-1.5 rounded-full border-2 border-amber-900/40 text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition"
          title="Toggle Calm Bedtime Mode"
        >
          <span>{calmBedtimeMode ? "🌙 Bedtime Mode" : "☀️ Play Mode"}</span>
        </button>
      </header>

      {/* Responsive Multi-Posture Grid:
          - Mobile (<768px): Single column; Backpack sits below the active panel
          - Tablet (768px-1279px): 2-Column Open Book Spread
          - Desktop (1280px+): 3-Pane Studio (Left: Backpack, Centre: Book Page, Right: Director's Chair)
      */}
      <main className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <aside className="md:col-span-4 xl:col-span-3 order-2 md:order-1">
          <BackpackDrawer />
        </aside>

        <section className="md:col-span-8 xl:col-span-9 order-1 md:order-2 grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Director's Chair: full-width while directing; docked right on XL desktop while reading */}
          <div className={isDirecting ? "block xl:col-span-12" : "hidden xl:block xl:col-span-5"}>
            <DirectorsChair />
          </div>

          {!isDirecting && (
            <div className="xl:col-span-7">
              <LivingStorybookPage />
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
```

---

## 7. The Chapter "Director's Chair" (`DirectorsChair.tsx`)

Renders the **"Previously On..."** banner, the **3 Flip-In Tarot Cards** (+ dynamically minted 4th Wildcard card), the **Giant Red Microphone**, the **Spice Rack**, and the chunky **"Write Chapter!"** button.

```tsx
// src/components/DirectorsChair.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStoryDirectorStore, BeatStyle } from "../store/useStoryDirectorStore";
import { useTactileFeedback } from "../hooks/useTactileFeedback";

const CARD_THEMES: Record<BeatStyle, { badge: string; bg: string; border: string }> = {
  BOLD_ACTION: {
    badge: "⚔️ Bold Move",
    bg: "bg-gradient-to-br from-orange-100 to-amber-50 text-stone-900",
    border: "border-orange-500",
  },
  CLEVER_TRICK: {
    badge: "🧠 Sneaky Plan",
    bg: "bg-gradient-to-br from-sky-100 to-indigo-50 text-stone-900",
    border: "border-sky-500",
  },
  SILLY_TWIST: {
    badge: "🤪 Bonkers Twist",
    bg: "bg-gradient-to-br from-fuchsia-100 to-pink-50 text-stone-900",
    border: "border-fuchsia-500",
  },
  KID_WILDCARD: {
    badge: "👑 Your Royal Idea!",
    bg: "bg-gradient-to-br from-yellow-200 via-amber-100 to-yellow-50 text-stone-950",
    border: "border-amber-600",
  },
};

export const DirectorsChair: React.FC = () => {
  const {
    chapterIndex,
    recapOneLiner,
    beatCards,
    selectedCardId,
    selectBeatCard,
    addWildcardBeat,
    modifiers,
    updateModifier,
    startChapterStream,
    calmBedtimeMode,
  } = useStoryDirectorStore();

  const { triggerHaptic, speakText } = useTactileFeedback(calmBedtimeMode);
  const [isRecording, setIsRecording] = useState(false);

  // Voice-to-Wildcard Card flow.
  // In production: capture audio via MediaRecorder -> POST /api/chapters/{id}/wildcard/
  // -> Whisper STT -> Prompt 1 (Voice-Wildcard Normaliser) -> StoryBeatCard
  const handleMicPressEnd = async () => {
    setIsRecording(false);
    triggerHaptic([20, 40, 20]);
    addWildcardBeat({
      cardId: `wildcard_${Date.now()}`,
      style: "KID_WILDCARD",
      title: "The Giant Bubble-Burping Frog!",
      kidFriendlyPitch:
        "Your idea: A friendly giant frog hops out of the kelp and traps the runaway cake inside a giant pink bubble!",
      iconEmoji: "🐸",
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. "Previously On..." Bookmark Banner */}
      <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-600/30 flex items-center justify-between gap-3">
        <p className="text-sm sm:text-base font-medium italic">
          🔖 <span className="font-bold not-italic">Chapter {chapterIndex}:</span> {recapOneLiner}
        </p>
        <button
          onClick={() => speakText(recapOneLiner)}
          className="shrink-0 w-10 h-10 rounded-full bg-amber-400 text-stone-950 flex items-center justify-center border-2 border-stone-900 shadow active:translate-y-0.5"
          aria-label="Read recap out loud"
        >
          🔊
        </button>
      </div>

      {/* 2. The 3 (+1) Story Tarot Cards */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold mb-3 flex items-center gap-2">
          🎬 Director's Chair: What happens next?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <AnimatePresence>
            {beatCards.map((card, idx) => {
              const theme = CARD_THEMES[card.style];
              const isSelected = selectedCardId === card.cardId;

              return (
                <motion.div
                  key={card.cardId}
                  initial={{ opacity: 0, rotateY: 90, y: 20 }}
                  animate={{
                    opacity: 1,
                    rotateY: 0,
                    y: isSelected ? -6 : 0,
                    scale: isSelected ? 1.03 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 20, delay: idx * 0.08 }}
                  onClick={() => {
                    triggerHaptic(15);
                    selectBeatCard(card.cardId);
                  }}
                  className={`cursor-pointer rounded-3xl p-5 border-2 border-b-[6px] transition-all flex flex-col justify-between ${theme.bg} ${
                    isSelected
                      ? "border-stone-950 ring-4 ring-amber-400 shadow-xl"
                      : `${theme.border} opacity-90 hover:opacity-100`
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/80 border border-stone-900/20">
                        {theme.badge}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakText(`${card.title}. ${card.kidFriendlyPitch}`);
                        }}
                        className="w-8 h-8 rounded-full bg-white/90 border border-stone-900/30 flex items-center justify-center text-sm hover:scale-110"
                        title="Listen to this card"
                      >
                        🔊
                      </button>
                    </div>

                    <div className="text-4xl mb-2">{card.iconEmoji}</div>
                    <h3 className="text-lg font-extrabold leading-snug mb-1.5">{card.title}</h3>
                    <p className="text-sm leading-relaxed text-stone-700">{card.kidFriendlyPitch}</p>
                  </div>

                  {card.suggestedItemId && (
                    <div className="mt-4 pt-2 border-t border-stone-900/10 flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <span>🎒 Uses Backpack Item!</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* 3. The Giant Red Microphone (Voice Wildcard) */}
      <div className="flex flex-col items-center justify-center p-4 rounded-3xl border-2 border-dashed border-amber-700/40 bg-amber-500/5">
        <motion.button
          onMouseDown={() => {
            triggerHaptic(25);
            setIsRecording(true);
          }}
          onMouseUp={handleMicPressEnd}
          onTouchStart={() => {
            triggerHaptic(25);
            setIsRecording(true);
          }}
          onTouchEnd={handleMicPressEnd}
          animate={isRecording ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ repeat: isRecording ? Infinity : 0, duration: 0.6 }}
          className={`px-6 py-3.5 rounded-full font-extrabold text-base flex items-center gap-3 border-2 border-stone-900 border-b-[6px] active:border-b-2 active:translate-y-[4px] ${
            isRecording
              ? "bg-rose-600 text-white ring-8 ring-rose-500/30"
              : "bg-rose-500 hover:bg-rose-400 text-white"
          }`}
        >
          <span className="text-xl">{isRecording ? "👾" : "🎙️"}</span>
          <span>{isRecording ? "Listening! Tell me what happens..." : "Hold to Tell Your Own Crazy Idea!"}</span>
        </motion.button>
      </div>

      {/* 4. The "Spice Rack" Pre-Generation Modifiers */}
      <div className="p-4 rounded-3xl bg-amber-900/5 border-2 border-amber-900/15 space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider opacity-75">
          🧂 Director's Spice Rack (Optional Tweaks)
        </h3>

        <div className="flex flex-wrap gap-2.5">
          {/* Weather / Mood Pills */}
          {(
            [
              { id: "SUNNY", label: "☀️ Sunny & Bright" },
              { id: "STORMY", label: "⛈️ Stormy & Wild" },
              { id: "SPOOKY_NIGHT", label: "🔦 Spooky Flashlight" },
              { id: "BUBBLY_CHAOS", label: "🫧 Silly Chaos" },
            ] as const
          ).map((mood) => {
            const active = modifiers.weatherOrMood === mood.id;
            return (
              <button
                key={mood.id}
                onClick={() => {
                  triggerHaptic(10);
                  updateModifier("weatherOrMood", active ? null : mood.id);
                }}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold border-2 border-b-4 active:border-b-2 active:translate-y-0.5 transition ${
                  active ? "bg-amber-400 text-stone-950 border-stone-900" : "bg-white/80 text-stone-800 border-stone-300"
                }`}
              >
                {mood.label}
              </button>
            );
          })}

          {/* Sound Effects Toggle */}
          <button
            onClick={() => {
              triggerHaptic(10);
              updateModifier("soundEffectsBoost", !modifiers.soundEffectsBoost);
            }}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold border-2 border-b-4 active:border-b-2 active:translate-y-0.5 transition ${
              modifiers.soundEffectsBoost
                ? "bg-emerald-400 text-stone-950 border-stone-900"
                : "bg-white/80 text-stone-800 border-stone-300"
            }`}
          >
            💥 {modifiers.soundEffectsBoost ? "Lots of SPLAT & BOOM Words!" : "Normal Sound Words"}
          </button>

          {/* Cliffhanger Meter */}
          <button
            onClick={() => {
              triggerHaptic(10);
              updateModifier(
                "endingStyle",
                modifiers.endingStyle === "CLIFFHANGER" ? "COZY_PAUSE" : "CLIFFHANGER"
              );
            }}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold border-2 border-stone-900 border-b-4 bg-purple-200 text-stone-900"
          >
            {modifiers.endingStyle === "CLIFFHANGER"
              ? "😱 End on a Surprise Cliffhanger!"
              : "☕ End on a Cosy Breather"}
          </button>
        </div>
      </div>

      {/* 5. Big "Write Chapter!" Launch Button */}
      <button
        disabled={!selectedCardId}
        onClick={() => {
          triggerHaptic([30, 50, 30]);
          startChapterStream();
        }}
        className={`w-full py-4 rounded-3xl font-black text-lg sm:text-xl border-2 border-stone-900 border-b-[8px] active:border-b-2 active:translate-y-[6px] transition-all ${
          selectedCardId
            ? "bg-emerald-400 hover:bg-emerald-300 text-stone-950 cursor-pointer shadow-lg"
            : "bg-stone-300 text-stone-500 cursor-not-allowed opacity-60"
        }`}
      >
        🪄 Write Chapter {chapterIndex}!
      </button>
    </div>
  );
};
```

---

## 8. The Tactile Backpack Drawer (`BackpackDrawer.tsx`)

Tapping an item glows it gold and locks it into the chapter prompt. Items used in earlier chapters remain visible with a badge so the child can see their journey history.

```tsx
// src/components/BackpackDrawer.tsx
import React from "react";
import { motion } from "framer-motion";
import { useStoryDirectorStore } from "../store/useStoryDirectorStore";
import { useTactileFeedback } from "../hooks/useTactileFeedback";

export const BackpackDrawer: React.FC = () => {
  const { backpack, toggleBackpackItemForChapter, calmBedtimeMode } = useStoryDirectorStore();
  const { triggerHaptic, speakText } = useTactileFeedback(calmBedtimeMode);

  return (
    <div className="p-5 rounded-3xl bg-amber-900/10 border-2 border-amber-900/20 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-base flex items-center gap-2">🎒 Hero's Backpack</h3>
        <span className="text-xs font-bold opacity-70">Tap to use in this chapter!</span>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
        {backpack.map((item) => {
          const isReserved = item.status === "RESERVED_THIS_CHAPTER";
          const isUsed = item.status === "USED";

          return (
            <motion.button
              key={item.id}
              whileTap={!isUsed ? { scale: 0.95 } : undefined}
              onClick={() => {
                if (isUsed) return;
                triggerHaptic(15);
                toggleBackpackItemForChapter(item.id);
                speakText(isReserved ? `Put ${item.name} back in backpack` : `Use ${item.name} in this chapter!`);
              }}
              className={`p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition-all ${
                isUsed
                  ? "bg-stone-300/40 border-stone-400/40 opacity-50 cursor-not-allowed line-through"
                  : isReserved
                  ? "bg-amber-300 text-stone-950 border-stone-900 border-b-4 ring-4 ring-amber-400/50 shadow-md"
                  : "bg-white/90 text-stone-900 border-stone-400 border-b-4 hover:border-stone-900"
              }`}
            >
              <span className="text-2xl sm:text-3xl">{item.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold text-xs sm:text-sm truncate">{item.name}</div>
                <div className="text-[11px] font-bold opacity-75">
                  {isUsed ? "✓ Already Used" : isReserved ? "✨ Using in this chapter!" : "In Backpack"}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
```

---

## 9. The Living Storybook Page (`LivingStorybookPage.tsx`)

Two signature pieces of magic:
1. **The 3-Stage Living Illustration Frame:** Painting loader $\rightarrow$ static illustration (~3s) $\rightarrow$ golden shimmer cross-fade into the looping Grok/Veo MP4 (~20s).
2. **Tap-Paragraph-to-Remix (The Magic Wand):** Tapping any paragraph opens a floating wand bar that rewrites just that paragraph in place.

```tsx
// src/components/LivingStorybookPage.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStoryDirectorStore, RemixMode } from "../store/useStoryDirectorStore";
import { useTactileFeedback } from "../hooks/useTactileFeedback";

export const LivingStorybookPage: React.FC = () => {
  const {
    chapterIndex,
    chapterTitle,
    paragraphs,
    mediaStage,
    illustrationUrl,
    videoUrl,
    replaceRemixedParagraph,
    calmBedtimeMode,
  } = useStoryDirectorStore();

  const { triggerHaptic, speakText } = useTactileFeedback(calmBedtimeMode);
  const [activeParagraphIdx, setActiveParagraphIdx] = useState<number | null>(null);
  const [isRemixingIdx, setIsRemixingIdx] = useState<number | null>(null);

  // In production: POST /api/chapters/{id}/remix-paragraph/ with { index, mode } -> Prompt 5
  const handleWandRemix = async (index: number, mode: RemixMode) => {
    triggerHaptic([15, 30, 15]);
    setIsRemixingIdx(index);
    setActiveParagraphIdx(null);

    setTimeout(() => {
      replaceRemixedParagraph(
        index,
        `${paragraphs[index]} "BLUB-BLUB-SPLAT!" hiccuped Barnaby, as a giant purple bubble popped right on the tip of his whiskers!`
      );
      setIsRemixingIdx(null);
    }, 1100);
  };

  return (
    <article
      className={`rounded-3xl p-6 sm:p-10 border-2 shadow-xl space-y-6 ${
        calmBedtimeMode
          ? "bg-slate-900 border-amber-500/20 text-amber-50"
          : "bg-[#FFFDF7] border-stone-900/15 text-stone-900"
      }`}
    >
      {/* 1. THE 3-STAGE LIVING ILLUSTRATION HEADER */}
      <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border-2 border-stone-900/20 bg-amber-100/40 shadow-inner">
        <AnimatePresence mode="wait">
          {mediaStage === "PAINTING" && (
            <motion.div
              key="painting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-amber-100/60 to-orange-100/40 text-stone-700"
            >
              <motion.div
                animate={{ rotate: [-8, 8, -8], y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 1.8 }}
                className="text-5xl mb-3"
              >
                🎨
              </motion.div>
              <p className="font-extrabold text-sm sm:text-base">Painting your chapter picture...</p>
              <p className="text-xs opacity-75 mt-1">Start reading below while the magic ink dries!</p>
            </motion.div>
          )}

          {mediaStage === "STILL_READY" && illustrationUrl && (
            <motion.img
              key="still"
              src={illustrationUrl}
              alt={`Chapter ${chapterIndex} illustration`}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="w-full h-full object-cover"
            />
          )}

          {mediaStage === "VIDEO_READY" && videoUrl && (
            <motion.div
              key="video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="relative w-full h-full"
            >
              <video
                src={videoUrl}
                poster={illustrationUrl ?? undefined}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-stone-950/75 text-amber-300 text-xs font-extrabold backdrop-blur-sm flex items-center gap-1.5">
                <span>✨ Living Picture</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. CHAPTER TITLE */}
      <div className="border-b-2 border-amber-900/10 pb-4 flex items-center justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-amber-600">Chapter {chapterIndex}</span>
          <h1 className="text-2xl sm:text-3xl font-black font-serif mt-0.5">
            {chapterTitle || "Into the Bubbly Kelp Forest"}
          </h1>
        </div>
        <button
          onClick={() => speakText(paragraphs.join(" "))}
          className="px-4 py-2 rounded-full bg-amber-400 text-stone-950 font-extrabold text-xs border-2 border-stone-900 border-b-4 active:border-b-2 active:translate-y-0.5"
        >
          🔊 Read Chapter to Me
        </button>
      </div>

      {/* 3. STREAMING STORY PARAGRAPHS WITH TAP-TO-REMIX MAGIC WAND */}
      <div className="space-y-5 font-serif text-lg sm:text-xl leading-relaxed">
        {paragraphs.map((para, idx) => {
          const isSelected = activeParagraphIdx === idx;
          const isRemixing = isRemixingIdx === idx;

          return (
            <div key={idx} className="relative group">
              <motion.p
                layout
                onClick={() => {
                  triggerHaptic(10);
                  setActiveParagraphIdx(isSelected ? null : idx);
                }}
                className={`cursor-pointer p-3 -mx-3 rounded-2xl transition-colors ${
                  idx === 0
                    ? "first-letter:float-left first-letter:text-5xl first-letter:font-black first-letter:mr-3 first-letter:leading-none first-letter:text-amber-600"
                    : ""
                } ${
                  isRemixing
                    ? "animate-pulse bg-amber-300/30 text-stone-500"
                    : isSelected
                    ? "bg-amber-400/20 ring-2 ring-amber-500"
                    : "hover:bg-amber-500/10"
                }`}
              >
                {para}
              </motion.p>

              {/* Floating Magic Revision Wand Bar */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="mt-2 p-2 rounded-2xl bg-stone-900 text-white shadow-xl flex flex-wrap items-center gap-2 z-20"
                  >
                    <span className="text-xs font-bold px-2 text-amber-300">🪄 Magic Wand:</span>
                    {(
                      [
                        { mode: "MAKE_FUNNIER", label: "😂 Funnier" },
                        { mode: "MORE_DIALOGUE", label: "🗣️ More Talking" },
                        { mode: "ADD_SENSORY", label: "🔍 Describe More" },
                        { mode: "LESS_SCARY", label: "🧸 Make Friendly" },
                      ] as const
                    ).map((wand) => (
                      <button
                        key={wand.mode}
                        onClick={() => handleWandRemix(idx, wand.mode)}
                        className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-amber-400 hover:text-stone-950 text-xs font-extrabold transition"
                      >
                        {wand.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </article>
  );
};
```

---

## 10. Extra Polish Gems

1. **The "Sign Your Book" Canvas (`react-signature-canvas` $\rightarrow$ SVG):** At the Publishing Ceremony, the child signs their name on a parchment card. Export stroke paths as clean `<svg viewBox="...">` markup, save to `story.author_signature_svg`, and inject into `titlepage.xhtml` inside the EPUB.
2. **Pre-Fetching Chapter $N+1$ Cards During Reading:** While the child reads and remixes Chapter $N$, the frontend silently fetches the pre-generated `beatCards` for Chapter $N+1$ into the Zustand store so the next Director's Chair appears instantly.
3. **CSS-Only 3D Book Spine at the Publishing Ceremony:** Wrap the cover image in a 3D perspective container (`transform-style: preserve-3d; transform: rotateY(-25deg)`) with pseudo-elements for page edges and spine. Let the child drag to spin their finished book before triggering the `.epub` download or "Open in Apple Books" sheet.
