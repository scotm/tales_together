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

export const PROVIDER_MAX_ATTEMPTS = 4;
export const PROVIDER_TIMEOUT_MS = 60_000;
export const PROVIDER_RETRY_BASE_MS = 1_000;
export const PROVIDER_RETRY_MAX_MS = 30_000;
// Longer than two worst-case provider requests (initial prose + expansion).
export const GENERATION_LEASE_MS = 15 * 60_000;

// Both purposes default to Gemini 3.5 Flash-Lite (GA 2026-07-21). Prose moved
// off gemini-3.8-flash on 2026-11-05: its thinking tokens ate the output cap
// (1533 of 1600, 45 words returned) and it cost more for prose the child could
// not tell apart. See decisions.md. Raise GEMINI_PROSE_MODEL for a fancier
// book, but pin the version — an alias that moves mid-book would change the
// narrator's voice between chapters.
export const GEMINI_PROSE_MODEL =
  process.env.GEMINI_PROSE_MODEL ?? "gemini-3.5-flash-lite";
export const GEMINI_FAST_MODEL =
  process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite";

// Local model server for development: oMLX on the dev Mac serves an
// OpenAI-compatible API. Setting LOCAL_LLM_URL moves every provider call to it,
// so testing costs nothing. Dev only — a 4B model writes no shippable prose.
// From inside the Docker backend use http://host.docker.internal:5005/v1.
export const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL;
export const LOCAL_LLM_MODEL =
  process.env.LOCAL_LLM_MODEL ?? "gemma-4-e4b-it-4bit";

// Flash-Lite treats "400 to 550 words" as advice: a five-chapter run came in
// at 274–442. Below this floor `writeChapter` spends one corrective call before
// accepting the result; it never blocks the reader.
export const PROSE_MIN_WORDS = 360;

// Illustration model (verified 2026-11-05): 4:3, ~1.2 MB JPEG, ~5 s a chapter.
export const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

// Surplus is opt-in: qualify offers against their reference price and verify
// the settled charge separately. No automatic paid fallback between vendors.
export const SURPLUS_DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
export const SURPLUS_DEFAULT_MIN_DISCOUNT_PCT = 50;
