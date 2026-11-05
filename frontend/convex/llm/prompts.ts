import { READING_LEVEL } from "../lib/config";
import type { ArcRole } from "./promptMatrices";
import { BANNED_PHRASES } from "./proseLint";

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

/** Injected into every prose prompt. Ported from docs/03 §3. */
export const GLOBAL_WRITING_RULES = `
<global_writing_rules>
1. BANNED AI CLICHÉS: Never use the words/phrases ${BANNED_PHRASES.map((phrase) => `"${phrase}"`).join(", ")}.
2. NO MORALISING LECTURES: Never end a chapter with a summary paragraph explaining the moral of the story (e.g., "And so Barnaby learned that teamwork makes the dream work"). Let the actions and humour speak for themselves.
3. RESPECT THE PACING LOCK: You are writing ONE chapter of a multi-chapter book. Only write the events of the current chapter beat. Never fast-forward to the end of the book unless isFinalChapter is true.
4. KID-SAFE PIVOTING: Keep all content 100% safe for children. Slapstick, gross-out humour (burps, mud, smelly cheese, silly monsters), and mild spooky tension are encouraged if they fit the vibe, but zero real violence, cruelty, or frightening trauma.
</global_writing_rules>
`.trim();

export interface ChapterProseInput {
  storyTitle: string;
  chapterIndex: number;
  totalChapters: number;
  arc: ArcRole;
  setting: string;
  vibe: string;
  characters: PitchCharacter[];
  availableItems: PitchItem[];
  unresolvedThreads: string[];
  priorChapters: { index: number; summaryBullets: string[] }[];
  /** Verbatim last two paragraphs of chapter N-1. */
  previousChapterTail?: string;
  chosenBeat: { title: string; kidFriendlyPitch: string };
  useItemName?: string;
  endingStyle: "CLIFFHANGER" | "COZY_PAUSE";
}

/** Prompt 3, docs/03 §6. Returns the two parts the provider needs. */
export function chapterProsePrompt(input: ChapterProseInput): {
  system: string;
  user: string;
} {
  const level = READING_LEVEL_MATRIX[READING_LEVEL];

  const cast = input.characters
    .map(
      (character) =>
        `- ${character.name} (${character.role}): ${character.visualDescription}. ` +
        `Quirk: ${character.quirk}.`,
    )
    .join("\n");

  const summarySoFar = input.priorChapters
    .map(
      (chapter) =>
        `Chapter ${chapter.index}: ${chapter.summaryBullets.join(" ")}`,
    )
    .join("\n");

  const continuity = input.previousChapterTail
    ? `
<seamless_continuity_anchor>
Here are the exact final two paragraphs of Chapter ${input.chapterIndex - 1}. Pick up the scene and momentum seamlessly from this exact moment without repeating it:
"""
${input.previousChapterTail}
"""
</seamless_continuity_anchor>
`
    : "";

  const orders = [
    `- **Chosen Plot Beat:** ${input.chosenBeat.title} — ${input.chosenBeat.kidFriendlyPitch}`,
    input.useItemName
      ? `- **MANDATORY BACKPACK ITEM:** The characters MUST actively use the **${input.useItemName}** from their backpack at a key moment in this chapter!`
      : "",
    input.endingStyle === "CLIFFHANGER" &&
    input.chapterIndex < input.totalChapters
      ? `- **CHAPTER ENDING:** End the final paragraph on an exciting mini-cliffhanger or surprise discovery that leads into Chapter ${input.chapterIndex + 1}!`
      : "- **CHAPTER ENDING:** End this chapter on a warm, safe, or funny beat where the characters catch their breath.",
  ]
    .filter(Boolean)
    .join("\n");

  const system = `
You are an award-winning children's book author writing **Chapter ${input.chapterIndex} of ${input.totalChapters}** for the book "${input.storyTitle}".

${GLOBAL_WRITING_RULES}

<reading_level_constraints>
Target Audience: ${level.label}
Target Length: ${level.wordCountTarget} (${level.paragraphCount})
Linguistic Rules:
${level.linguisticRules}
</reading_level_constraints>

<narrative_arc_mandate>
Chapter ${input.chapterIndex} Role: ${input.arc.role}
${input.arc.instructions}
</narrative_arc_mandate>
`.trim();

  const user = `
<world_and_cast>
Setting: ${input.setting}
Vibe: ${input.vibe}
Characters:
${cast}
Current Backpack Inventory: ${JSON.stringify(input.availableItems)}
Unresolved Plot Threads: ${input.unresolvedThreads.join("; ")}
</world_and_cast>

<story_summary_so_far>
${summarySoFar || "(This is the first chapter.)"}
</story_summary_so_far>
${continuity}
<child_director_orders>
The child Director has chosen the following outline for Chapter ${input.chapterIndex}. You MUST honour every single one of these choices:
${orders}
</child_director_orders>

Write the chapter prose now. Separate each paragraph with a double newline. Do not include a chapter heading or commentary—output only the story paragraphs.
`.trim();

  return { system, user };
}
