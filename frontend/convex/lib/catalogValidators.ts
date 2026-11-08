import { v } from "convex/values";

export const catalogCategory = v.union(
  v.literal("setting"),
  v.literal("problem"),
  v.literal("character"),
  v.literal("outfit"),
  v.literal("quirk"),
  v.literal("item"),
);
export const catalogContent = {
  key: v.string(),
  category: catalogCategory,
  sortOrder: v.number(),
  label: v.string(),
  displayLabel: v.string(),
  promptFragment: v.string(),
  titleSuffix: v.optional(v.string()),
  assetKey: v.optional(v.string()),
  previewFileId: v.optional(v.id("_storage")),
  previewLayout: v.optional(v.union(v.literal("layer"), v.literal("icon"))),
  isDefault: v.boolean(),
  supportsGender: v.optional(v.boolean()),
};
export const catalogReference = v.object({
  optionId: v.id("catalogOptions"),
  revision: v.number(),
});
export const choiceSnapshot = v.object({
  kind: v.literal("catalog"),
  optionId: v.id("catalogOptions"),
  key: v.string(),
  revision: v.number(),
  label: v.string(),
  displayLabel: v.string(),
  description: v.string(),
  assetKey: v.optional(v.string()),
});
export const kidGender = v.union(
  v.literal("open"),
  v.literal("girl"),
  v.literal("boy"),
  v.literal("non-binary"),
);
export const storySetupChoices = v.object({
  setting: choiceSnapshot,
  problem: choiceSnapshot,
  packed: v.array(choiceSnapshot),
});
export const heroPart = v.union(
  v.literal("character"),
  v.literal("outfit"),
  v.literal("quirk"),
  v.literal("details"),
);
export const customReference = v.object({
  kind: v.literal("custom"),
  ideaId: v.id("heroIdeas"),
  part: heroPart,
});
export const heroReference = v.union(catalogReference, customReference);
export const ideaPart = v.object({
  part: heroPart,
  label: v.string(),
  description: v.string(),
});
export const customSnapshot = v.object({
  kind: v.literal("custom"),
  ideaId: v.id("heroIdeas"),
  part: heroPart,
  label: v.string(),
  displayLabel: v.string(),
  description: v.string(),
  source: v.union(v.literal("typed"), v.literal("spoken")),
  interpretationVersion: v.literal("v1"),
  confirmedText: v.string(),
});
export const heroChoiceSnapshot = v.union(choiceSnapshot, customSnapshot);
export const heroContext = v.object({
  character: heroReference,
  outfit: heroReference,
  quirk: heroReference,
  details: v.optional(customReference),
  kidGender,
});
export const heroSetupChoices = v.object({
  character: heroChoiceSnapshot,
  outfit: heroChoiceSnapshot,
  quirk: heroChoiceSnapshot,
  details: v.optional(customSnapshot),
  kidGender,
});
