import type { Id } from "@convex/_generated/dataModel";
import heroOptions from "@convex/fixtures/hero-options.json";
import {
  CONVEYOR_ITEMS,
  WORLD_PROBLEMS,
  WORLD_SETTINGS,
} from "@convex/fixtures/legacyCatalog";
import {
  type ChoiceView,
  catalogDefaults,
  groupCatalog,
} from "@/features/setup/catalog";

const groups = [
  ["setting", WORLD_SETTINGS],
  ["problem", WORLD_PROBLEMS],
  ["character", heroOptions.characters],
  ["outfit", heroOptions.outfits],
  ["quirk", heroOptions.quirks],
  ["item", CONVEYOR_ITEMS],
] as const;
export const catalogFixture = {
  backpackSize: 3,
  options: groups.flatMap(([category, options]) =>
    options.map(
      (option, sortOrder): ChoiceView => ({
        optionId: `catalog_${option.id}_1` as Id<"catalogOptions">,
        key: option.id,
        category,
        revision: 1,
        active: true,
        withdrawn: false,
        sortOrder,
        label: option.label,
        displayLabel:
          "displayLabel" in option && typeof option.displayLabel === "string"
            ? option.displayLabel
            : option.label,
        isDefault: category === "item" ? sortOrder < 3 : sortOrder === 0,
        supportsGender: option.id === "hero_kid",
        assetKey: option.id,
        previewUrl: null,
        previewLayout:
          category === "character" || category === "outfit" ? "layer" : "icon",
      }),
    ),
  ),
};
export const defaultsFixture = catalogDefaults(groupCatalog(catalogFixture));
export function fixtureChoice(key: string) {
  const option = catalogFixture.options.find((row) => row.key === key);
  if (!option) throw new Error("Missing fixture choice");
  return { optionId: option.optionId, revision: option.revision };
}
