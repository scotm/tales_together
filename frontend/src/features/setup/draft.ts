/**
 * The in-memory setup draft: world, hero and backpack choices made before a
 * story exists. Pure reducer so step navigation and Surprise are testable
 * without rendering. See storybook-workshop-implementation.md §4.
 *
 * Choices pin a logical key and exact Convex revision. Custom-idea references
 * will extend `HeroChoice` in W4.
 */
import type { Id } from "@convex/_generated/dataModel";

export type SetupStep = "world" | "hero" | "backpack";
export type HeroStep = "character" | "outfit" | "quirk" | "name";
export type WorldPart = "setting" | "problem";
export type HeroPart = "character" | "outfit" | "quirk";

export type CatalogChoice = {
  kind: "catalog";
  key: string;
  optionId: Id<"catalogOptions">;
  revision: number;
};
export type KidGender = "open" | "girl" | "boy" | "non-binary";
export type HeroChoice = CatalogChoice;

export interface SetupDraft {
  step: SetupStep;
  heroStep: HeroStep;
  setting: CatalogChoice;
  problem: CatalogChoice;
  keepSetting: boolean;
  keepProblem: boolean;
  character: HeroChoice;
  outfit: HeroChoice;
  quirk: HeroChoice;
  revealed: { outfit: boolean; quirk: boolean };
  kidGender: KidGender;
  heroName: string;
  authorName: string;
  packed: CatalogChoice[];
}

export interface DraftDefaults {
  setting: CatalogChoice;
  problem: CatalogChoice;
  character: CatalogChoice;
  outfit: CatalogChoice;
  quirk: CatalogChoice;
  packed: CatalogChoice[];
}

export interface WorldOptions {
  settings: readonly CatalogChoice[];
  problems: readonly CatalogChoice[];
}

export type SetupAction =
  | { type: "initialize"; defaults: DraftDefaults }
  | { type: "setKidGender"; value: KidGender }
  | { type: "goToStep"; step: SetupStep }
  | { type: "goToHeroStep"; heroStep: HeroStep }
  | { type: "selectWorld"; part: WorldPart; choice: CatalogChoice }
  | { type: "toggleKeep"; part: WorldPart }
  | { type: "surprise"; options: WorldOptions; random?: () => number }
  | { type: "selectHero"; part: HeroPart; choice: HeroChoice }
  | { type: "setHeroName"; value: string }
  | { type: "setAuthorName"; value: string }
  | { type: "toggleItem"; choice: CatalogChoice; capacity: number }
  | { type: "reset"; defaults: DraftDefaults };

export function createDraft(defaults: DraftDefaults): SetupDraft {
  return {
    step: "world",
    heroStep: "character",
    setting: defaults.setting,
    problem: defaults.problem,
    keepSetting: false,
    keepProblem: false,
    character: defaults.character,
    outfit: defaults.outfit,
    quirk: defaults.quirk,
    revealed: { outfit: false, quirk: false },
    kidGender: "open",
    heroName: "",
    authorName: "",
    packed: [...defaults.packed],
  };
}

/** A blank or whitespace name cannot start a story. */
export function hasHeroName(draft: SetupDraft): boolean {
  return draft.heroName.trim().length > 0;
}

/** World Surprise may return the current option (existing spin semantics). */
function pickAny(keys: readonly CatalogChoice[], random: () => number) {
  if (keys.length === 0) return undefined;
  const index = Math.min(Math.floor(random() * keys.length), keys.length - 1);
  return keys[index];
}

export function setupReducer(
  draft: SetupDraft,
  action: SetupAction,
): SetupDraft {
  switch (action.type) {
    case "initialize":
      return draft;
    case "setKidGender":
      return { ...draft, kidGender: action.value };
    case "goToStep":
      // Backpack, and so story creation, needs a named hero.
      if (action.step === "backpack" && !hasHeroName(draft)) {
        return {
          ...draft,
          step: "hero",
          heroStep: "name",
          revealed: { outfit: true, quirk: true },
        };
      }
      return {
        ...draft,
        step: action.step,
        revealed:
          action.step === "backpack"
            ? { outfit: true, quirk: true }
            : draft.revealed,
      };
    case "goToHeroStep":
      return {
        ...draft,
        step: "hero",
        heroStep: action.heroStep,
        revealed: {
          outfit: draft.revealed.outfit || action.heroStep !== "character",
          quirk:
            draft.revealed.quirk ||
            action.heroStep === "quirk" ||
            action.heroStep === "name",
        },
      };
    case "selectWorld":
      return { ...draft, [action.part]: action.choice };
    case "toggleKeep":
      return action.part === "setting"
        ? { ...draft, keepSetting: !draft.keepSetting }
        : { ...draft, keepProblem: !draft.keepProblem };
    case "surprise": {
      const random = action.random ?? Math.random;
      const setting = draft.keepSetting
        ? undefined
        : pickAny(action.options.settings, random);
      const problem = draft.keepProblem
        ? undefined
        : pickAny(action.options.problems, random);
      return {
        ...draft,
        ...(setting ? { setting } : {}),
        ...(problem ? { problem } : {}),
      };
    }
    case "selectHero":
      return {
        ...draft,
        [action.part]: action.choice,
        ...(action.part === "character" &&
        action.choice.key !== draft.character.key
          ? { kidGender: "open" as const }
          : {}),
      };
    case "setHeroName":
      return { ...draft, heroName: action.value };
    case "setAuthorName":
      return { ...draft, authorName: action.value };
    case "toggleItem": {
      const existing = draft.packed.find(
        (choice) => choice.key === action.choice.key,
      );
      if (existing && existing.optionId !== action.choice.optionId) {
        return {
          ...draft,
          packed: draft.packed.map((choice) =>
            choice.key === action.choice.key ? action.choice : choice,
          ),
        };
      }
      if (existing) {
        return {
          ...draft,
          packed: draft.packed.filter(
            (choice) => choice.key !== action.choice.key,
          ),
        };
      }
      // A full bag stays unchanged; the UI explains removing an item first.
      if (draft.packed.length >= action.capacity) return draft;
      return { ...draft, packed: [...draft.packed, action.choice] };
    }
    case "reset":
      return createDraft(action.defaults);
  }
}
