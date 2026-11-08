import { api } from "@convex/_generated/api";
import { useConvexConnectionState, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { useQueryDiagnostics } from "@/lib/diagnostics/query";
import type { CatalogChoice, DraftDefaults, SetupDraft } from "./draft";
import { useSetupSession } from "./SetupProvider";

type CatalogResult = FunctionReturnType<typeof api.catalog.listChoices>;
export type ChoiceView = CatalogResult["options"][number];
export interface WorkshopCatalog extends CatalogResult {
  settings: ChoiceView[];
  problems: ChoiceView[];
  characters: ChoiceView[];
  outfits: ChoiceView[];
  quirks: ChoiceView[];
  items: ChoiceView[];
}

export function groupCatalog(result: CatalogResult): WorkshopCatalog {
  const group = (category: ChoiceView["category"]) =>
    result.options.filter((row) => row.category === category);
  return {
    ...result,
    settings: group("setting"),
    problems: group("problem"),
    characters: group("character"),
    outfits: group("outfit"),
    quirks: group("quirk"),
    items: group("item"),
  };
}
export const available = (choices: ChoiceView[]) =>
  choices.filter((row) => row.active && !row.withdrawn);
export const catalogChoice = (option: ChoiceView): CatalogChoice => ({
  kind: "catalog",
  key: option.key,
  optionId: option.optionId,
  revision: option.revision,
});
export const reference = (choice: CatalogChoice) => ({
  optionId: choice.optionId,
  revision: choice.revision,
});
export function selectedChoices(draft: SetupDraft) {
  return [
    draft.setting,
    draft.problem,
    draft.character,
    draft.outfit,
    draft.quirk,
    ...draft.packed,
  ];
}
export function catalogDefaults(
  catalog: WorkshopCatalog,
): DraftDefaults | null {
  const first = (options: ChoiceView[]) => {
    const active = available(options);
    return active.find((row) => row.isDefault) ?? active[0];
  };
  const singles = [
    catalog.settings,
    catalog.problems,
    catalog.characters,
    catalog.outfits,
    catalog.quirks,
  ].map(first);
  const items = available(catalog.items);
  const packed = [
    ...items.filter((row) => row.isDefault),
    ...items.filter((row) => !row.isDefault),
  ].slice(0, catalog.backpackSize);
  if (singles.some((row) => !row) || packed.length !== catalog.backpackSize)
    return null;
  const [setting, problem, character, outfit, quirk] = singles as [
    ChoiceView,
    ChoiceView,
    ChoiceView,
    ChoiceView,
    ChoiceView,
  ];
  return {
    setting: catalogChoice(setting),
    problem: catalogChoice(problem),
    character: catalogChoice(character),
    outfit: catalogChoice(outfit),
    quirk: catalogChoice(quirk),
    packed: packed.map(catalogChoice),
  };
}

/** One subscription for active options plus pinned revisions; cache outlives backend remounts. */
export function useWorkshopCatalog() {
  const { draft, dispatch, catalog, setCatalog } = useSetupSession();
  const pinned = draft
    ? selectedChoices(draft).map((choice) => choice.optionId)
    : [];
  const result = useQuery(api.catalog.listChoices, { pinned });
  const connection = useConvexConnectionState();
  useQueryDiagnostics(
    "catalog.listChoices",
    result,
    connection.isWebSocketConnected,
  );
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (result !== undefined) setCatalog(groupCatalog(result));
  }, [result, setCatalog]);
  useEffect(() => {
    if (draft || !catalog) return;
    const defaults = catalogDefaults(catalog);
    if (defaults) dispatch({ type: "initialize", defaults });
  }, [draft, catalog, dispatch]);
  useEffect(() => {
    setTimedOut(false);
    if (result !== undefined) return;
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [result]);
  return {
    catalog,
    ready: Boolean(draft && catalog),
    timedOut,
    empty: Boolean(catalog && !catalogDefaults(catalog)),
    pending: result === undefined,
  };
}

export function labelFor(choices: ChoiceView[], choice: CatalogChoice): string {
  return (
    choices.find((row) => row.optionId === choice.optionId)?.label ??
    "Unavailable choice"
  );
}
export function choiceFor(choices: ChoiceView[], choice: CatalogChoice) {
  return choices.find((row) => row.optionId === choice.optionId);
}
