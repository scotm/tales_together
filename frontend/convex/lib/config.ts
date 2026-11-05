// v0 constants live here and nowhere else. Slices change these values, not
// the call sites.
export const CHAPTER_COUNT = 5;

export const READING_LEVEL = "AGES_7_9" as const;

export const DEFAULT_VIBE = "SILLY_ADVENTURE";

export const DEFAULT_ART_STYLE =
  "Warm watercolour and ink children's storybook illustration, whimsical, vibrant";

// Hard per-story caps, retries included. See decisions.md "Safety, spend, delivery".
export const BOOK_BUDGET_USD = 0.5;
export const BOOK_IMAGE_CAP = 6;

// Latest Gemini Flash pair (verified 2026-11-05):
//   prose/cards  — gemini-3.8-flash, GA 2026-09-02
//   structured   — gemini-3.5-flash-lite, GA 2026-07-21
// Pin the version, never `gemini-flash-latest`: an alias that moves mid-book
// would change the narrator's voice between chapters.
export const GEMINI_PROSE_MODEL =
  process.env.GEMINI_PROSE_MODEL ?? "gemini-3.8-flash";
export const GEMINI_FAST_MODEL =
  process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite";

// Local model server for development: oMLX on the dev Mac serves an
// OpenAI-compatible API. Setting LOCAL_LLM_URL moves every provider call to it,
// so testing costs nothing. Dev only — a 4B model writes no shippable prose.
// From inside the Docker backend use http://host.docker.internal:5005/v1.
export const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL;
export const LOCAL_LLM_MODEL =
  process.env.LOCAL_LLM_MODEL ?? "gemma-4-e4b-it-4bit";
