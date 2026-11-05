/**
 * JSON Schema for Gemini's `responseSchema` (an OpenAPI subset: no
 * additionalProperties, no oneOf). Keep in step with the Convex validator in
 * schema.ts — the mutation is what actually rejects a bad card.
 */
export const BEAT_PITCH_SCHEMA = {
  type: "object",
  required: ["recapOneLiner", "cards"],
  properties: {
    recapOneLiner: {
      type: "string",
      description: "Exciting 'Previously on...' sentence, max 25 words",
    },
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        required: ["cardId", "style", "title", "kidFriendlyPitch", "iconEmoji"],
        properties: {
          cardId: { type: "string", description: "e.g. card_1a" },
          style: {
            type: "string",
            enum: ["BOLD_ACTION", "CLEVER_TRICK", "SILLY_TWIST"],
          },
          title: {
            type: "string",
            description: "Punchy title for the UI card, max 5 words",
          },
          kidFriendlyPitch: {
            type: "string",
            description:
              "1-2 sentences written directly to the child, max 25 words",
          },
          iconEmoji: { type: "string", description: "Single emoji" },
          suggestedItemId: {
            type: "string",
            nullable: true,
            description: "Catalog id of a backpack item, or null",
          },
        },
      },
    },
  },
} as const;

/**
 * Prompt 4 output. Mirrored by the `applyExtraction` validator in
 * `chapters.ts`; `extraction.test.ts` keeps the two in step.
 */
export const EXTRACTION_SCHEMA = {
  type: "object",
  required: [
    "chapterTitle",
    "summaryBullets",
    "itemsUsed",
    "newItems",
    "unresolvedThreads",
    "illustrationPrompt",
    "videoMotionPrompt",
  ],
  properties: {
    chapterTitle: {
      type: "string",
      description: "Short chapter title, max 5 words",
    },
    summaryBullets: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
      description: "Exactly 3 short past-tense sentences of what happened",
    },
    itemsUsed: {
      type: "array",
      items: { type: "string" },
      description: "Catalog ids of backpack items used in this chapter",
    },
    newItems: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string", description: "e.g. item_rainbow_feather" },
          name: { type: "string" },
        },
      },
      description: "Items picked up in this chapter, empty if none",
    },
    unresolvedThreads: {
      type: "array",
      items: { type: "string" },
      description: "Every thread still open at the end of this chapter",
    },
    illustrationPrompt: {
      type: "string",
      description:
        "One iconic moment, with full visual descriptions inlined, no text",
    },
    videoMotionPrompt: {
      type: "string",
      description: "Subtle 5-second motion starting from that frame",
    },
  },
} as const;
