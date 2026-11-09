import { api } from "@convex/_generated/api";
import { useConvexConnectionState, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { rememberStory } from "@/lib/storyShelf";
import {
  catalogDefaults,
  reference,
  selectedChoices,
  type WorkshopCatalog,
} from "./catalog";
import { hasHeroName, heroReference } from "./draft";
import { useSetupDraft } from "./SetupProvider";

/**
 * Creates the story from the setup draft. A synchronous ref guards repeated
 * taps before React re-renders. Success resets the draft after keeping the
 * story id for navigation; every failure leaves the draft intact.
 */
export function useCreateStory(catalog: WorkshopCatalog) {
  const { draft, dispatch } = useSetupDraft();
  const createStory = useMutation(api.stories.createFromSetup);
  const connection = useConvexConnectionState();
  const diagnostics = useDiagnostics();
  const router = useRouter();
  const inFlight = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capacity = catalog.backpackSize;
  const hasCustom = [
    draft.character,
    draft.outfit,
    draft.quirk,
    draft.details,
  ].some((choice) => choice?.kind === "custom");
  const customExpired =
    (hasCustom &&
      (!draft.ideaCapability ||
        (draft.ideaSessionExpiresAt ?? 0) <= Date.now())) ||
    [draft.character, draft.outfit, draft.quirk, draft.details].some(
      (choice) => choice?.kind === "custom" && choice.expiresAt <= Date.now(),
    );
  const invalid = selectedChoices(draft).some(
    (choice) =>
      !catalog.options.some(
        (option) => option.optionId === choice.optionId && !option.withdrawn,
      ),
  );
  const blockedReason = customExpired
    ? "A custom idea expired. Reopen it and review it again; your choices are kept."
    : invalid
      ? "A choice is unavailable or withdrawn. Please replace it before starting."
      : !connection.isWebSocketConnected
        ? "Connect to the story server before starting a story."
        : !hasHeroName(draft)
          ? "Give your hero a name first."
          : draft.packed.length !== capacity
            ? `Pack exactly ${capacity} things first.`
            : null;

  async function start() {
    if (inFlight.current || blockedReason) {
      if (blockedReason) setError(blockedReason);
      return;
    }
    inFlight.current = true;
    setCreating(true);
    setError(null);
    try {
      const args = {
        setting: reference(draft.setting),
        problem: reference(draft.problem),
        character: heroReference(draft.character),
        outfit: heroReference(draft.outfit),
        quirk: heroReference(draft.quirk),
        packed: draft.packed.map(reference),
        ...(draft.details
          ? {
              details: {
                kind: "custom" as const,
                ideaId: draft.details.ideaId,
                part: draft.details.part,
              },
            }
          : {}),
        ...(draft.ideaCapability && hasCustom
          ? { ideaCapability: draft.ideaCapability }
          : {}),
        kidGender: catalog.characters.find(
          (row) => row.optionId === draft.character.optionId,
        )?.supportsGender
          ? draft.kidGender
          : "open",
        protagonistName: draft.heroName.trim(),
        authorName: draft.authorName.trim() || undefined,
      };
      const storyId = await diagnostics.track("stories.createFromSetup", () =>
        createStory(args),
      );
      void rememberStory(storyId);
      router.push({ pathname: "/story/[storyId]", params: { storyId } });
      const defaults = catalogDefaults(catalog);
      if (defaults) dispatch({ type: "reset", defaults });
    } catch (cause) {
      setError(
        cause instanceof ConvexError
          ? String(cause.data)
          : cause instanceof Error
            ? cause.message
            : "Could not start a story",
      );
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return { start, creating, error, blockedReason };
}
