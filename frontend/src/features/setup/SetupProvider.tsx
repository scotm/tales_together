import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useReducer,
  useRef,
  useState,
} from "react";
import type { WorkshopCatalog } from "./catalog";
import {
  createDraft,
  type DraftDefaults,
  type SetupAction,
  type SetupDraft,
  setupReducer,
} from "./draft";

interface SetupContextValue {
  draft: SetupDraft | null;
  dispatch: Dispatch<SetupAction>;
  catalog: WorkshopCatalog | null;
  shelfOffsets: Record<string, number>;
  setCatalog: Dispatch<SetStateAction<WorkshopCatalog | null>>;
}
const SetupContext = createContext<SetupContextValue | null>(null);

/** Draft and catalogue cache outlive backend recovery and route changes. */
export function SetupProvider({
  children,
  defaults,
}: {
  children: ReactNode;
  defaults?: DraftDefaults;
}) {
  const [draft, dispatch] = useReducer(
    (draft: SetupDraft | null, action: SetupAction) =>
      draft
        ? setupReducer(draft, action)
        : action.type === "initialize"
          ? createDraft(action.defaults)
          : null,
    defaults ? createDraft(defaults) : null,
  );
  const shelfOffsets = useRef<Record<string, number>>({});
  const [catalog, setCatalog] = useState<WorkshopCatalog | null>(null);
  return (
    <SetupContext.Provider
      value={{
        draft,
        dispatch,
        catalog,
        setCatalog,
        shelfOffsets: shelfOffsets.current,
      }}
    >
      {children}
    </SetupContext.Provider>
  );
}
export function useSetupSession(): SetupContextValue {
  const value = useContext(SetupContext);
  if (!value) throw new Error("useSetupSession needs a SetupProvider");
  return value;
}
export function useSetupDraft() {
  const value = useSetupSession();
  if (!value.draft)
    throw new Error("Load the catalogue before opening the workshop.");
  return { ...value, draft: value.draft };
}
