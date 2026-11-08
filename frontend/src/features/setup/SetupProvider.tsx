import {
  CONVEYOR_ITEMS,
  HERO_ARCHETYPES,
  HERO_OUTFITS,
  QUIRK_STICKERS,
  WORLD_PROBLEMS,
  WORLD_SETTINGS,
} from "@convex/catalog";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useReducer,
} from "react";
import {
  createDraft,
  type DraftDefaults,
  type SetupAction,
  type SetupDraft,
  setupReducer,
} from "./draft";

// Interim (W1): defaults come from the source catalogue. W2 moves them to
// Convex catalogue records flagged `isDefault`.
export const sourceDefaults: DraftDefaults = {
  setting: WORLD_SETTINGS[0]?.id ?? "",
  problem: WORLD_PROBLEMS[0]?.id ?? "",
  character: HERO_ARCHETYPES[0]?.id ?? "",
  outfit: HERO_OUTFITS[0]?.id ?? "",
  quirk: QUIRK_STICKERS[0]?.id ?? "",
  packed: ["item_whisk", "item_jam", "item_kazoo"].filter((id) =>
    CONVEYOR_ITEMS.some((item) => item.id === id),
  ),
};

interface SetupContextValue {
  draft: SetupDraft;
  dispatch: Dispatch<SetupAction>;
  defaults: DraftDefaults;
}

const SetupContext = createContext<SetupContextValue | null>(null);

/**
 * Holds one unfinished setup for the running app session. Mount it outside
 * `BackendProvider` so a backend remount during recovery or a
 * trip to Diagnostics cannot erase the child's choices.
 */
export function SetupProvider({
  children,
  defaults = sourceDefaults,
}: {
  children: ReactNode;
  defaults?: DraftDefaults;
}) {
  const [draft, dispatch] = useReducer(setupReducer, defaults, createDraft);
  return (
    <SetupContext.Provider value={{ draft, dispatch, defaults }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetupDraft(): SetupContextValue {
  const value = useContext(SetupContext);
  if (!value) throw new Error("useSetupDraft needs a SetupProvider");
  return value;
}
