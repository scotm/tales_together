export interface ArcRole {
  role: string;
  instructions: string;
}

/**
 * Maps Chapter N of M to its structural job. Ported from docs/03 §2.
 * v0 is fixed at 5 chapters; the guard exists so chapter count can never be
 * made configurable without someone noticing the hook/finale collision.
 */
export function getArcRoleInstructions(
  chapterIndex: number,
  totalChapters: number,
): ArcRole {
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
