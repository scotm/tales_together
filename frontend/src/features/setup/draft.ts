/**
 * The in-memory setup draft: world, hero and backpack choices made before a
 * story exists. Pure reducer so step navigation and Surprise are testable
 * without rendering. See storybook-workshop-implementation.md §4.
 *
 * Choices are logical catalogue keys (`hero_otter`, `item_jam`, …). W2 adds
 * Convex catalogue revisions; W4 adds custom-idea references to `HeroChoice`.
 */

export type SetupStep = "world" | "hero" | "backpack";
export type HeroStep = "character" | "outfit" | "quirk" | "name";
export type WorldPart = "setting" | "problem";
export type HeroPart = "character" | "outfit" | "quirk";

export type CatalogChoice = { kind: "catalog"; key: string };
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
  heroName: string;
  authorName: string;
  packed: string[];
}

export interface DraftDefaults {
  setting: string;
  problem: string;
  character: string;
  outfit: string;
  quirk: string;
  packed: string[];
}

export interface WorldOptions {
  settings: readonly string[];
  problems: readonly string[];
}

export type SetupAction =
  | { type: "goToStep"; step: SetupStep }
  | { type: "goToHeroStep"; heroStep: HeroStep }
  | { type: "selectWorld"; part: WorldPart; key: string }
  | { type: "toggleKeep"; part: WorldPart }
  | { type: "surprise"; options: WorldOptions; random?: () => number }
  | { type: "selectHero"; part: HeroPart; choice: HeroChoice }
  | { type: "setHeroName"; value: string }
  | { type: "setAuthorName"; value: string }
  | { type: "toggleItem"; key: string; capacity: number }
  | { type: "reset"; defaults: DraftDefaults };

export function catalogChoice(key: string): CatalogChoice {
  return { kind: "catalog", key };
}

export function createDraft(defaults: DraftDefaults): SetupDraft {
  return {
    step: "world",
    heroStep: "character",
    setting: catalogChoice(defaults.setting),
    problem: catalogChoice(defaults.problem),
    keepSetting: false,
    keepProblem: false,
    character: catalogChoice(defaults.character),
    outfit: catalogChoice(defaults.outfit),
    quirk: catalogChoice(defaults.quirk),
    revealed: { outfit: false, quirk: false },
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
function pickAny(keys: readonly string[], random: () => number) {
  if (keys.length === 0) return undefined;
  const index = Math.min(Math.floor(random() * keys.length), keys.length - 1);
  return keys[index];
}

export function setupReducer(
  draft: SetupDraft,
  action: SetupAction,
): SetupDraft {
  switch (action.type) {
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
      return { ...draft, [action.part]: catalogChoice(action.key) };
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
        ...(setting ? { setting: catalogChoice(setting) } : {}),
        ...(problem ? { problem: catalogChoice(problem) } : {}),
      };
    }
    case "selectHero":
      return { ...draft, [action.part]: action.choice };
    case "setHeroName":
      return { ...draft, heroName: action.value };
    case "setAuthorName":
      return { ...draft, authorName: action.value };
    case "toggleItem": {
      if (draft.packed.includes(action.key)) {
        return {
          ...draft,
          packed: draft.packed.filter((key) => key !== action.key),
        };
      }
      // A full bag stays unchanged; the UI explains removing an item first.
      if (draft.packed.length >= action.capacity) return draft;
      return { ...draft, packed: [...draft.packed, action.key] };
    }
    case "reset":
      return createDraft(action.defaults);
  }
}
