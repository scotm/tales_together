import {
  BACKPACK_SIZE,
  type CatalogOption,
  CONVEYOR_ITEMS,
  HERO_ARCHETYPES,
  HERO_OUTFITS,
  QUIRK_STICKERS,
  WORLD_PROBLEMS,
  WORLD_SETTINGS,
} from "@convex/catalog";
import type { SetupDraft } from "./draft";

/** Display data for shelves; legacy prompt composition stays in the adapter. */
export interface ChoiceView {
  key: string;
  label: string;
}

export interface WorkshopCatalog {
  settings: ChoiceView[];
  problems: ChoiceView[];
  characters: ChoiceView[];
  outfits: ChoiceView[];
  quirks: ChoiceView[];
  items: ChoiceView[];
  backpackSize: number;
}

const view = (option: CatalogOption): ChoiceView => ({
  key: option.id,
  label: option.label,
});

/**
 * Interim (W1) catalogue read from source. W2 replaces this hook with the
 * Convex `catalog.listChoices` query and adds loading/empty/failed states;
 * screens consume only `WorkshopCatalog`, so they do not change.
 */
const sourceCatalog: WorkshopCatalog = {
  settings: WORLD_SETTINGS.map(view),
  problems: WORLD_PROBLEMS.map(view),
  characters: HERO_ARCHETYPES.map(view),
  outfits: HERO_OUTFITS.map(view),
  quirks: QUIRK_STICKERS.map(view),
  items: CONVEYOR_ITEMS.map(view),
  backpackSize: BACKPACK_SIZE,
};

export function useWorkshopCatalog(): WorkshopCatalog {
  return sourceCatalog;
}

export function labelFor(choices: ChoiceView[], key: string): string {
  return choices.find((choice) => choice.key === key)?.label ?? key;
}

/**
 * Interim (W1) payload for the legacy `stories.create` mutation, which still
 * accepts client-composed prompt text. W3 replaces it with
 * `stories.createFromSetup`, where the server resolves every reference.
 */
export function legacyCreateArgs(draft: SetupDraft) {
  const find = <T extends CatalogOption>(options: T[], key: string): T => {
    const option = options.find((entry) => entry.id === key);
    if (!option) throw new Error("One of your choices is no longer available.");
    return option;
  };
  const heroName = draft.heroName.trim();
  const setting = find(WORLD_SETTINGS, draft.setting.key);
  const problem = find(WORLD_PROBLEMS, draft.problem.key);
  const character = find(HERO_ARCHETYPES, draft.character.key);
  const outfit = find(HERO_OUTFITS, draft.outfit.key);
  const quirk = find(QUIRK_STICKERS, draft.quirk.key);
  const authorName = draft.authorName.trim();
  return {
    title: `${heroName} and ${problem.titleSuffix}`,
    setting: setting.promptFragment,
    centralProblem: problem.promptFragment,
    protagonistName: heroName,
    protagonistQuirk: quirk.promptFragment,
    visualDescription: `${character.promptFragment} ${outfit.promptFragment}`,
    authorName: authorName || undefined,
    backpackItems: draft.packed.map((key) => ({
      id: key,
      name: find(CONVEYOR_ITEMS, key).label,
    })),
  };
}
