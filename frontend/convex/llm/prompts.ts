import { READING_LEVEL } from "../lib/config";
import type { ArcRole } from "./promptMatrices";

export interface ReadingLevelRules {
  label: string;
  wordCountTarget: string;
  paragraphCount: string;
  linguisticRules: string;
}

// v0 fixes one level. Adding a level means adding a row here and widening the
// schema union — the same edit, so they cannot drift.
export const READING_LEVEL_MATRIX: Record<
  typeof READING_LEVEL,
  ReadingLevelRules
> = {
  AGES_7_9: {
    label: "Early Chapter Book (Ages 7–9, e.g., Magic Treehouse / Roald Dahl)",
    wordCountTarget: "400 to 550 words",
    paragraphCount: "6 to 9 paragraphs",
    linguisticRules: `
- Average sentence length: 10–14 words. Mix snappy 4-word action sentences with descriptive 18-word sentences.
- High dialogue-to-narration ratio (at least 40% dialogue). Let characters bicker, joke, and react out loud.
- Use vivid, specific sensory details (especially smells, textures, food, and silly physical slapstick).
- Introduce playful wordplay, alliteration, and humorous comparisons (e.g., "grumpier than a wet badger").
- Show emotions through physical reactions (hiccuping, ears drooping, knees knocking) rather than stating "he felt nervous".
`.trim(),
  },
};

export interface PitchCharacter {
  name: string;
  role: string;
  visualDescription: string;
  quirk: string;
}

export interface PitchItem {
  id: string;
  name: string;
}

export interface BeatPitchPromptInput {
  storyTitle: string;
  vibe: string;
  setting: string;
  characters: PitchCharacter[];
  availableItems: PitchItem[];
  unresolvedThreads: string[];
  priorChapters: { index: number; title?: string; summaryBullets: string[] }[];
  chapterIndex: number;
  totalChapters: number;
  arc: ArcRole;
}

/** Prompt 2, docs/03 §5. Returns the two parts the provider needs. */
export function beatPitchPrompt(input: BeatPitchPromptInput): {
  system: string;
  user: string;
} {
  const level = READING_LEVEL_MATRIX[READING_LEVEL];

  const storySoFar =
    input.priorChapters.length === 0
      ? "(This is the first chapter.)"
      : input.priorChapters
          .map(
            (chapter) =>
              `Chapter ${chapter.index} (${chapter.title ?? "untitled"}):\n` +
              chapter.summaryBullets.map((bullet) => `- ${bullet}`).join("\n"),
          )
          .join("\n\n");

  const system = `
You are the Master Story Architect for a children's interactive book.
You are pitching 3 distinct plot options for **Chapter ${input.chapterIndex} of ${input.totalChapters}**.

<narrative_arc_mandate>
Current Arc Role: ${input.arc.role}
Arc Instructions: ${input.arc.instructions}
</narrative_arc_mandate>

<card_design_rules>
You must generate exactly 3 distinct cards:
1. "BOLD_ACTION": A high-energy, physical, or brave choice (chasing, climbing, sneaking, building).
2. "CLEVER_TRICK": A puzzle, disguise, invention, or use of a specific item from the hero's backpack.
3. "SILLY_TWIST": An unexpected, funny, or topsy-turvy surprise (a grumpy creature wants a hug, an object starts talking, a comical misunderstanding).

CRITICAL RULES:
- At least ONE card must explicitly suggest using an unused item from the available backpack items. Set suggestedItemId to that item's exact id (e.g. "item_whisk").
- Keep kidFriendlyPitch under 25 words per card so a child can read or listen to it in 5 seconds.
- Ensure all 3 choices move the plot forward according to the Arc Instructions above.
- Write to a child. No moralising, no clichés like "tapestry" or "little did they know".
</card_design_rules>
`.trim();

  const user = `
<world_bible>
Title: ${input.storyTitle}
Vibe: ${input.vibe}
Reading Level: ${level.label}
Setting: ${input.setting}
Characters: ${JSON.stringify(input.characters)}
Available Backpack Items (UNUSED): ${JSON.stringify(input.availableItems)}
Unresolved Plot Threads: ${input.unresolvedThreads.join("; ")}
</world_bible>

<story_so_far>
${storySoFar}
</story_so_far>

Generate recapOneLiner ("Previously on...") and the 3 cards for Chapter ${input.chapterIndex}.
`.trim();

  return { system, user };
}
