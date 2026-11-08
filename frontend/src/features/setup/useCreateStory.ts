import { api } from "@convex/_generated/api";
import { useConvexConnectionState, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { legacyCreateArgs } from "./catalog";
import { hasHeroName } from "./draft";
import { useSetupDraft } from "./SetupProvider";

/**
 * Creates the story from the setup draft. A synchronous ref guards repeated
 * taps before React re-renders. Success resets the draft after keeping the
 * story id for navigation; every failure leaves the draft intact.
 */
export function useCreateStory(capacity: number) {
  const { draft, dispatch, defaults } = useSetupDraft();
  const createStory = useMutation(api.stories.create);
  const connection = useConvexConnectionState();
  const diagnostics = useDiagnostics();
  const router = useRouter();
  const inFlight = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedReason = !connection.isWebSocketConnected
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
      const args = legacyCreateArgs(draft);
      const storyId = await diagnostics.track("stories.create", () =>
        createStory(args),
      );
      router.push({ pathname: "/story/[storyId]", params: { storyId } });
      dispatch({ type: "reset", defaults });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start a story",
      );
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return { start, creating, error, blockedReason };
}
