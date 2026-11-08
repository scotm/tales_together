/**
 * The in-memory setup draft: world, hero and backpack choices made before a
 * story exists. Pure reducer so step navigation and Surprise are testable
 * without rendering. See storybook-workshop-implementation.md §4.
 *
 * Curated choices pin a logical key and exact Convex revision. Custom parts
 * reference private confirmed ideas; unfinished edits and earlier custom choices
 * stay in this session draft when browsing presets.
 */

import type { Id } from "@convex/_generated/dataModel";
import { contextKey } from "../../../shared/heroIdeas";

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
export type CustomChoice = {
  kind: "custom";
  ideaId: Id<"heroIdeas">;
  part: "character" | "outfit" | "quirk" | "details";
  key: string;
  label: string;
  description: string;
  confirmedText: string;
  expiresAt: number;
  source: "typed" | "spoken";
  optionId?: undefined;
  revision?: undefined;
};
export type HeroChoice = CatalogChoice | CustomChoice;

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
  details?: CustomChoice;
  ideaCapability?: string;
  ideaSessionExpiresAt?: number;
  ideaText: string;
  ideaEditorPart?: CustomChoice["part"];
  ideaDrafts: Partial<
    Record<CustomChoice["part"], { text: string; source: "typed" | "spoken" }>
  >;
  customHistory: Partial<Record<CustomChoice["part"], CustomChoice>>;
  ideaSource: "typed" | "spoken";
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
  | { type: "setIdeaSession"; capability: string; expiresAt: number }
  | { type: "openIdeaEditor"; part: CustomChoice["part"] }
  | { type: "setIdeaText"; text: string; source: "typed" | "spoken" }
  | { type: "applyIdea"; expectedContext: string; choices: CustomChoice[] }
  | { type: "removeDetail" }
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
    ideaText: "",
    ideaDrafts: {},
    customHistory: {},
    ideaSource: "typed",
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
    case "setIdeaSession":
      return {
        ...draft,
        ideaCapability: action.capability,
        ideaSessionExpiresAt: action.expiresAt,
      };
    case "openIdeaEditor": {
      const previous = draft.ideaDrafts[action.part];
      const confirmed = draft.customHistory[action.part];
      return {
        ...draft,
        ideaEditorPart: action.part,
        ideaText: previous?.text ?? confirmed?.confirmedText ?? "",
        ideaSource: previous?.source ?? confirmed?.source ?? "typed",
      };
    }
    case "setIdeaText":
      return {
        ...draft,
        ideaText: action.text,
        ideaSource: action.source,
        ideaDrafts: {
          ...draft.ideaDrafts,
          [draft.ideaEditorPart ?? "details"]: {
            text: action.text,
            source: action.source,
          },
        },
      };
    case "removeDetail":
      return { ...draft, details: undefined };
    case "applyIdea": {
      if (contextKey(draftContext(draft)) !== action.expectedContext)
        return draft;
      const patch: Partial<SetupDraft> = {};
      const customHistory = { ...draft.customHistory };
      const ideaDrafts = { ...draft.ideaDrafts };
      for (const choice of action.choices) {
        patch[choice.part] = choice;
        customHistory[choice.part] = choice;
        ideaDrafts[choice.part] = {
          text: choice.confirmedText,
          source: choice.source,
        };
      }
      return {
        ...draft,
        ...patch,
        customHistory,
        ideaDrafts,
        revealed: { outfit: true, quirk: true },
      };
    }
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
      return { ...draft, [action.part]: action.choice };
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

export function heroReference(choice: HeroChoice) {
  return choice.kind === "custom"
    ? { kind: "custom" as const, ideaId: choice.ideaId, part: choice.part }
    : { optionId: choice.optionId, revision: choice.revision };
}
export function draftContext(draft: SetupDraft) {
  return {
    character: heroReference(draft.character),
    outfit: heroReference(draft.outfit),
    quirk: heroReference(draft.quirk),
    ...(draft.details
      ? {
          details: {
            kind: "custom" as const,
            ideaId: draft.details.ideaId,
            part: draft.details.part,
          },
        }
      : {}),
    kidGender:
      draft.character.kind === "custom" ? ("open" as const) : draft.kidGender,
  };
}
