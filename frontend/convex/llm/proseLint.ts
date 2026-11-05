/**
 * Banned AI clichés. Shared with the prompt text in `prompts.ts` so the rule
 * the model reads and the rule the code enforces cannot drift apart.
 */
export const BANNED_PHRASES = [
  "tapestry",
  "symphony",
  "whimsical",
  "testament",
  "little did they know",
  "shimmering",
  "unbeknownst",
  "a sense of",
  "couldn't help but",
  "heart swelled",
] as const;

// docs/03 §2 asks for 4–18 word sentences at AGES_7_9. Both Gemini 3.8 Flash
// and Flash-Lite routinely land at 23–24 in a good paragraph, so the gate only
// catches runaway sentences.
const MAX_SENTENCE_WORDS = 28;

export type ProseLintResult = { ok: true } | { ok: false; reason: string };

/**
 * Cheap, deterministic check between the model and `REVIEWING`. It cannot
 * judge whether a chapter is good, only that it is not the slop the prompt
 * bans or unreadable to a seven-year-old.
 */
export function lintProse(paragraphs: string[]): ProseLintResult {
  const text = paragraphs.join("\n\n");
  const lower = text.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      return { ok: false, reason: `banned phrase "${phrase}"` };
    }
  }

  // Closing quotes and brackets sit between the full stop and the space, so a
  // naive split would glue `….” Then` into one long sentence.
  for (const sentence of text.split(/(?<=[.!?…]["'”’)\]]?)\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length > MAX_SENTENCE_WORDS) {
      return {
        ok: false,
        reason: `sentence is ${words.length} words (max ${MAX_SENTENCE_WORDS}): "${sentence.slice(0, 60)}…"`,
      };
    }
  }

  return { ok: true };
}
