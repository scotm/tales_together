# 03 — Prompt Engineering & Pacing Matrices

## 1. Philosophy: Defeating "AI Slop" & Pacing Collapse

When prompting LLMs to write children's fiction, vague instructions like *"Write a story for a
7-year-old"* produce sugary, repetitive clichés (*"Once upon a time, in a shimmering tapestry of
whimsy, little did Barnaby know that friendship was the greatest treasure of all..."*) and cause the
LLM to resolve the entire plot at the end of Chapter 1.

To achieve **Roald Dahl, Julia Donaldson, or Dav Pilkey** quality, prompts in **Tales Together** are
assembled dynamically from **strict constraint matrices** (`READING_LEVEL_MATRIX` +
`getArcRoleInstructions`) combined with the canonical story view from `docs/02` and the anti-slop
rules.

Everything here is TypeScript running inside Convex actions. The prompt strings are the durable
asset; they are plain template literals with no templating engine, so nothing has to be installed
and nothing can fail to render. Anything that varies per story is a parameter, and everything that
loops is `map(...).join(...)`.

---

## 2. The Constraint Matrices (`convex/llm/promptMatrices.ts`)

```ts
// convex/llm/promptMatrices.ts

export type ReadingLevel = "AGES_4_6" | "AGES_7_9" | "AGES_10_12";

export const READING_LEVEL_MATRIX: Record<
  ReadingLevel,
  {
    label: string;
    wordCountTarget: string;
    paragraphCount: string;
    linguisticRules: string;
  }
> = {
  AGES_4_6: {
    label: "Early Reader / Picture Book (Ages 4–6)",
    wordCountTarget: "180 to 250 words",
    paragraphCount: "4 to 6 short paragraphs (1–2 sentences each)",
    linguisticRules: `
- Maximum sentence length: 12 words. Average sentence length: 6–8 words.
- Use concrete, physical verbs (jumped, splashed, gobbled, hid) instead of abstract feelings.
- Lean heavily into sound effects (onomatopoeia: SPLASH! WHOOSH! CRUNCH!), rhythm, and rule-of-three repetition.
- Zero subplots or flashbacks. Everything happens right here, right now.
- Dialogue must be simple, punchy, and immediately tied to physical action.
`.trim(),
  },
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
  AGES_10_12: {
    label: "Middle Grade Adventure (Ages 10–12, e.g., Percy Jackson / Lemony Snicket)",
    wordCountTarget: "650 to 900 words",
    paragraphCount: "8 to 12 paragraphs",
    linguisticRules: `
- Rich, varied sentence cadence with witty narrator voice and dry humour.
- Include internal character thoughts, minor moral dilemmas, and clever problem-solving mechanics.
- Ban talking down to the reader. Treat the reader as sharp, observant, and in on the joke.
- Build atmosphere through environmental details, pacing tension, and earned comedic payoffs.
`.trim(),
  },
};

export function getArcRoleInstructions(
  chapterIndex: number,
  totalChapters: number,
): { role: string; instructions: string } {
  // v0 is fixed at 5 chapters. Guard before ever making the count configurable:
  // below 3 chapters the hook and the finale collide.
  if (totalChapters < 3) {
    throw new Error(`arc needs at least 3 chapters, got ${totalChapters}`);
  }

  if (chapterIndex === 1) {
    return {
      role: "HOOK_AND_INCITING_INCIDENT",
      instructions:
        "Establish the normal world, showcase the protagonist's quirk in action, " +
        "introduce the backpack items naturally, and trigger the central problem by the end of the chapter. " +
        "DO NOT solve the main problem yet. End with the heroes stepping out into the adventure.",
    };
  }
  if (chapterIndex === totalChapters) {
    return {
      role: "RESOLUTION_AND_CELEBRATION",
      instructions:
        "Resolve the final obstacle, tie up all remaining 'unresolvedThreads', " +
        "bring the heroes back to a warm/funny celebratory moment, and include a final callback joke " +
        "to the character's quirk. This is the FINAL chapter—give a deeply satisfying ending with no cliffhangers.",
    };
  }
  if (chapterIndex === totalChapters - 1) {
    return {
      role: "CLIMAX_AND_ALL_HOPE_IS_LOST",
      instructions:
        "This is the climax! Raise the stakes to their highest point. The main obstacle or antagonist " +
        "confronts the heroes directly. Force the heroes into a tight spot where their plan almost fails, " +
        "setting up the final resolution for the next (and final) chapter.",
    };
  }
  return {
    role: `RISING_ACTION_COMPLICATION_${chapterIndex}`,
    instructions:
      "The heroes make progress toward their goal, but encounter a surprising complication, puzzle, " +
      "or obstacle mid-way through. Deepen the relationship between the protagonist and sidekick. " +
      "CRITICAL: Do NOT resolve the overarching book plot in this chapter—only solve or complicate the immediate scene!",
  };
}
```

For a 5-chapter book this yields: **1** hook, **2–3** rising action, **4** climax, **5** resolution.

---

## 3. Global "Anti-Slop" & Guardrail System Preamble

Injected into every prose-generating and remixing prompt:

```ts
export const GLOBAL_WRITING_RULES = `
<global_writing_rules>
1. BANNED AI CLICHÉS: Never use the words/phrases "tapestry", "symphony", "whimsical", "testament", "little did they know", "shimmering", "unbeknownst", "a sense of", "couldn't help but", or "heart swelled".
2. NO MORALISING LECTURES: Never end a chapter with a summary paragraph explaining the moral of the story (e.g., "And so Barnaby learned that teamwork makes the dream work"). Let the actions and humour speak for themselves.
3. RESPECT THE PACING LOCK: You are writing ONE chapter of a multi-chapter book. Only write the events of the current chapter beat. Never fast-forward to the end of the book unless isFinalChapter is true.
4. KID-SAFE PIVOTING: Keep all content 100% safe for children. Slapstick, gross-out humour (burps, mud, smelly cheese, silly monsters), and mild spooky tension are encouraged if they fit the vibe, but zero real violence, cruelty, or frightening trauma.
</global_writing_rules>
`.trim();
```

---

## 4. Prompt 1: The Voice-Wildcard Normaliser (Child Audio → Story Card)

- **When it runs:** immediately after the speech-to-text transcript of the Giant Red Microphone
  recording arrives (post-v0 feature; the prompt is kept because it is the safe-pivot contract).
- **Output:** one `beatCard`, `style: "KID_WILDCARD"`.

```ts
export function wildcardPrompt(input: {
  storyTitle: string;
  chapterIndex: number;
  setting: string;
  charactersJson: string;
  priorChapterSummaries: string;
  availableItemsJson: string;
  transcript: string;
}): string {
  const system = `
<system_prompt>
You are the Creative Co-Director for a children's interactive storybook app.
A child just spoke an idea out loud for what should happen next in Chapter ${input.chapterIndex} of "${input.storyTitle}".

Your job is to transform their raw spoken transcript into a polished, exciting story beat card that:
1. Honours the core spirit and hilarity of the child's idea so they feel proud and heard!
2. Adapts any unsafe, overly violent, or completely plot-breaking elements into playful, cartoon-friendly slapstick that fits the current story world.
   - Example: If the child says "He shoots the dragon with a gun", pivot to "Barnaby blasts the dragon with a giant Marshmallow Cannon!"
   - Example: If the child says "Poop falls from the sky", pivot to "A sudden storm of stinky mud-pies rains down from the clouds!"
3. Connects their idea to the current characters and setting so the story remains coherent.
</system_prompt>`;

  const user = `
<story_context>
Setting: ${input.setting}
Characters: ${input.charactersJson}
Story So Far: ${input.priorChapterSummaries}
Available Backpack Items: ${input.availableItemsJson}
</story_context>

<child_raw_voice_transcript>
"${input.transcript}"
</child_raw_voice_transcript>

Return a single card with style "KID_WILDCARD". Write kidFriendlyPitch directly to the child in an enthusiastic tone (e.g., "Your idea: ...").
`;

  return `${system}\n\n${user}`;
}
```

---

## 5. Prompt 2: The Chapter Beat Pitcher (Generating the 3 Tarot Cards)

- **When it runs:** on entering `PITCHING`, or pre-generated while the child reads Chapter *N-1*.
- **Output:** `{ recapOneLiner, cards }`, exactly 3 cards.

```ts
export function beatPitchPrompt(input: {
  storyTitle: string;
  vibe: string;
  readingLevelLabel: string;
  setting: string;
  charactersJson: string;
  availableItemsJson: string;
  unresolvedThreads: string[];
  priorChapters: { index: number; title?: string; summaryBullets: string[] }[];
  chapterIndex: number;
  totalChapters: number;
  arc: { role: string; instructions: string };
}): string {
  const storySoFar =
    input.priorChapters.length === 0
      ? "(This is the first chapter.)"
      : input.priorChapters
          .map(
            (ch) =>
              `Chapter ${ch.index} (${ch.title ?? "untitled"}):\n` +
              ch.summaryBullets.map((b) => `- ${b}`).join("\n"),
          )
          .join("\n\n");

  return `
<system_prompt>
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
- At least ONE card must explicitly suggest using an unused item from available backpack items (populate suggestedItemId with that catalog id, e.g. "item_whisk").
- Keep kidFriendlyPitch under 25 words per card so a child can read or listen to it in 5 seconds.
- Ensure all 3 choices move the plot forward according to the Arc Instructions above.
</card_design_rules>
</system_prompt>

<user_prompt>
<world_bible>
Title: ${input.storyTitle}
Vibe: ${input.vibe}
Reading Level: ${input.readingLevelLabel}
Setting: ${input.setting}
Characters: ${input.charactersJson}
Available Backpack Items (UNUSED): ${input.availableItemsJson}
Unresolved Plot Threads: ${input.unresolvedThreads.join("; ")}
</world_bible>

<story_so_far>
${storySoFar}
</story_so_far>

Generate the recapOneLiner ("Previously on...") and the 3 cards for Chapter ${input.chapterIndex}.
</user_prompt>
`.trim();
}
```

---

## 6. Prompt 3: The Core Chapter Prose Generator (Streaming)

- **When it runs:** when the child taps **"🪄 Write Chapter!"** (chapter status `WRITING`).
- **Output:** double-newline-delimited paragraphs. Each one is appended to `chapters.paragraphs` by
  the action as it arrives, so the reactive query renders it immediately.

```ts
export function chapterProsePrompt(input: {
  storyTitle: string;
  chapterIndex: number;
  totalChapters: number;
  readingLevel: { label: string; wordCountTarget: string; paragraphCount: string; linguisticRules: string };
  arc: { role: string; instructions: string };
  setting: string;
  vibe: string;
  characters: { name: string; role: string; visualDescription: string; quirk: string }[];
  availableItemsJson: string;
  unresolvedThreads: string[];
  priorChapters: { index: number; summaryBullets: string[] }[];
  previousChapterTail?: string; // verbatim last two paragraphs of N-1
  chosenBeat: { title: string; kidFriendlyPitch: string };
  modifiers: {
    useItemName?: string;
    spotlightCharacterName?: string;
    weatherOrMood?: string;
    soundEffectsBoost: boolean;
    endingStyle: "CLIFFHANGER" | "COZY_PAUSE";
  };
  stealthVocabWords?: string[];
}): string {
  const cast = input.characters
    .map(
      (c) =>
        `- **${c.name}** (${c.role}): ${c.visualDescription}. Quirk: ${c.quirk}.`,
    )
    .join("\n");

  const summarySoFar = input.priorChapters
    .map((ch) => `Chapter ${ch.index}: ${ch.summaryBullets.join(" ")}`)
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

  const m = input.modifiers;
  const orders = [
    `- **Chosen Plot Beat:** ${input.chosenBeat.title} — ${input.chosenBeat.kidFriendlyPitch}`,
    m.useItemName
      ? `- **MANDATORY BACKPACK ITEM:** The characters MUST actively use the **${m.useItemName}** from their backpack at a key moment in this chapter!`
      : "",
    m.spotlightCharacterName
      ? `- **CHARACTER SPOTLIGHT:** Give **${m.spotlightCharacterName}** a funny or heroic standout moment using their quirk.`
      : "",
    m.weatherOrMood
      ? `- **ATMOSPHERE / WEATHER:** Set the scene mood/weather to: **${m.weatherOrMood}**.`
      : "",
    m.soundEffectsBoost
      ? "- **SOUND EFFECTS BOOST:** Weave expressive, capitalised sound effects (e.g., SPLAT!, WHOOSH!, CLANK!) naturally into the action."
      : "",
    m.endingStyle === "CLIFFHANGER" && input.chapterIndex < input.totalChapters
      ? `- **CHAPTER ENDING:** End the final paragraph on an exciting mini-cliffhanger or surprise discovery that leads into Chapter ${input.chapterIndex + 1}!`
      : m.endingStyle === "COZY_PAUSE"
        ? "- **CHAPTER ENDING:** End this chapter on a warm, safe, or funny beat where the characters catch their breath."
        : "",
    input.stealthVocabWords?.length
      ? `- **STEALTH VOCABULARY TREASURE:** Naturally weave these exact words into the chapter where a child can infer their meaning from context: ${input.stealthVocabWords.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `
<system_prompt>
You are an award-winning children's book author writing **Chapter ${input.chapterIndex} of ${input.totalChapters}** for the book "${input.storyTitle}".

${GLOBAL_WRITING_RULES}

<reading_level_constraints>
Target Audience: ${input.readingLevel.label}
Target Length: ${input.readingLevel.wordCountTarget} (${input.readingLevel.paragraphCount})
Linguistic Rules:
${input.readingLevel.linguisticRules}
</reading_level_constraints>

<narrative_arc_mandate>
Chapter ${input.chapterIndex} Role: ${input.arc.role}
${input.arc.instructions}
</narrative_arc_mandate>
</system_prompt>

<user_prompt>
<world_and_cast>
Setting: ${input.setting}
Vibe: ${input.vibe}
Characters:
${cast}
Current Backpack Inventory: ${input.availableItemsJson}
Unresolved Plot Threads: ${input.unresolvedThreads.join("; ")}
</world_and_cast>

<story_summary_so_far>
${summarySoFar || "(This is the first chapter.)"}
</story_summary_so_far>
${continuity}
<child_director_orders>
The child Director has chosen the following outline and modifiers for Chapter ${input.chapterIndex}. You MUST honour every single one of these choices:
${orders}
</child_director_orders>

Write the chapter prose now. Separate each paragraph with a double newline. Do not include a chapter heading or commentary—output only the story paragraphs.
</user_prompt>
`.trim();
}
```

Note that `useItemName` and `spotlightCharacterName` are **resolved by the caller** from
`useItemId` and `spotlightCharacterId` against the story view. The client only ever sends ids; the
action is the one place that turns an id into a name a prompt can inline.

---

## 7. Prompt 4: Post-Chapter State Extractor & Visual/Video Cinematographer

- **When it runs:** during `REVIEWING`, immediately after the prose stream finishes.
- **Output:** the `applyExtraction` validator from `docs/02` §4.
- **Key technique:** force the model to **inline the full `visualDescription`** of every character in
  the illustration and motion prompts, so stateless image and video models draw the same character
  in every chapter.

```ts
export function extractionPrompt(input: {
  chapterIndex: number;
  chapterParagraphs: string[];
  characters: { name: string; visualDescription: string }[];
  artStyle: string;
  availableItemsJson: string;
}): string {
  const sheets = input.characters
    .map((c) => `- ${c.name}: "${c.visualDescription}"`)
    .join("\n");

  return `
<system_prompt>
You are the Continuity Script Supervisor and Cinematographer for an animated children's storybook.
Read the newly generated text for Chapter ${input.chapterIndex} and extract the updated story state and visual generation prompts.

<visual_prompting_rules>
1. SELF-CONTAINED CHARACTER DESCRIPTIONS: Image and video models have NO memory of who "Barnaby" is. Never write just a character's name in illustrationPrompt or videoMotionPrompt. You MUST inline their exact visual description every time (e.g., instead of "Barnaby waves the whisk", write "A small scruffy brown river otter wearing a tall crooked white chef hat and red polka-dot apron waves a glowing golden whisk").
2. SINGLE CLEAR ACTION: Pick the single most visually exciting, iconic moment from the chapter. Describe the foreground subject, background environment, lighting, and facial expression.
3. NO TEXT IN IMAGES: Never ask for speech bubbles, signs, letters, or written words in the illustration.
4. CINEMAGRAPH MOTION (videoMotionPrompt): Describe a smooth, subtle 5-second motion starting from the exact static illustration frame. Focus on ambient physics (floating bubbles, flickering lantern light, wind in leaves, water ripples) + one clear character gesture (laughing, waving a wand, peeking around a corner). Avoid complex multi-cut camera jumps.
</visual_prompting_rules>
</system_prompt>

<user_prompt>
<canonical_character_sheets>
${sheets}
</canonical_character_sheets>

<art_style_lock>
${input.artStyle}
</art_style_lock>

<current_backpack_inventory>
${input.availableItemsJson}
</current_backpack_inventory>

<chapter_text>
${input.chapterParagraphs.join("\n\n")}
</chapter_text>

Extract chapterTitle, exactly 3 summaryBullets, itemsUsed (catalog ids), newItems (each with a catalog id and a name), unresolvedThreads, illustrationPrompt, and videoMotionPrompt.
</user_prompt>
`.trim();
}
```

---

## 8. Prompt 5: The Surgical "Magic Wand" Paragraph Remixer

- **When it runs:** when a child taps a paragraph in `LivingStorybookPage.tsx` and picks a wand
  (`MAKE_FUNNIER`, `MORE_DIALOGUE`, `ADD_SENSORY`, `LESS_SCARY`).
- **Output:** replacement text for that one paragraph, written back by a mutation. The running media
  pipeline is untouched — the illustration still matches the chapter, not the sentence.

```ts
export type RemixMode =
  | "MAKE_FUNNIER"
  | "MORE_DIALOGUE"
  | "ADD_SENSORY"
  | "LESS_SCARY";

export function remixPrompt(input: {
  chapterIndex: number;
  mode: RemixMode;
  protagonist: { name: string; quirk: string };
  readingLevel: { label: string; linguisticRules: string };
  preceding?: string;
  target: string;
  following?: string;
}): string {
  const wand: Record<RemixMode, string> = {
    MAKE_FUNNIER: `Inject physical slapstick, a silly comparison, a funny sound effect, or a comedic overreaction from ${input.protagonist.name} (using their quirk: ${input.protagonist.quirk}).`,
    MORE_DIALOGUE:
      "Turn the narration in this paragraph into snappy, playful back-and-forth dialogue between the characters in the scene.",
    ADD_SENSORY:
      "Add vivid, kid-friendly sensory details—what does the scene smell like, sound like, or feel like to touch?",
    LESS_SCARY:
      "Soften the tension! Make the obstacle or creature silly, clumsy, or friendly instead of intimidating.",
  };

  return `
<system_prompt>
You are the "Magic Revision Wand" in a children's storybook app.
The child reader tapped a specific paragraph in Chapter ${input.chapterIndex} and clicked the [${input.mode}] wand!

Your job is to rewrite ONLY <target_paragraph> according to the wand instruction below, while keeping the plot facts identical and ensuring it flows seamlessly between <preceding_paragraph> and <following_paragraph>.

<wand_instructions>
${wand[input.mode]}
</wand_instructions>

Reading Level Rules: ${input.readingLevel.label} — ${input.readingLevel.linguisticRules}
</system_prompt>

<user_prompt>
<preceding_paragraph>
${input.preceding ?? "[Start of Chapter]"}
</preceding_paragraph>

<target_paragraph>
${input.target}
</target_paragraph>

<following_paragraph>
${input.following ?? "[End of Chapter]"}
</following_paragraph>

Return ONLY the rewritten paragraph text (1–2 paragraphs max if adding dialogue). Do not repeat the preceding or following paragraphs.
</user_prompt>
`.trim();
}
```

A voice-driven `CUSTOM_VOICE_EDIT` mode adds one more arm with the child's transcript, guarded by the
same known-bad list and the same moderation call as every other provider request.

---

## 9. Quality-Control & Zero-Latency Hooks

1. **Cheap prose lint** (`convex/llm/lint.ts`), run on assembled prose before the chapter can be
   locked. Two checks only, both deterministic:
   - banned clichés from `GLOBAL_WRITING_RULES` (one regex, one pass);
   - maximum sentence length for the level (12 words at `AGES_4_6`, 18 everywhere else), measured by
     splitting on `[.!?]+`.

   A hit triggers one corrective call that returns the offending sentences only; it never rewrites
   the chapter. Skip a full Flesch-Kincaid implementation — sentence length plus the cliché list
   catches what actually shows up, and a readability score we do not act on is decoration.
2. **Pre-generate Chapter *N+1*'s beat cards during reading time.** As soon as the extraction action
   writes its result (~3s after streaming ends), schedule the next pitch action with `ctx.scheduler`.
   When the child taps **"Next Chapter!"**, the 3 cards are already in `beatCards` and the board
   renders with no wait.
3. **Moderation covers remixes and voice transcripts**, not just first-draft prose. Log the failure,
   never the transcript.
