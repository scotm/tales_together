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
