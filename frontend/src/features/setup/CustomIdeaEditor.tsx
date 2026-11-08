import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvexConnectionState, useMutation } from "convex/react";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { startRecording } from "@/lib/voice/recording";
import type { RecordingHandle } from "@/lib/voice/types";
import { contextKey } from "../../../shared/heroIdeas";
import { type CustomChoice, draftContext } from "./draft";
import { Field, setupStyles } from "./parts";
import { useSetupDraft } from "./SetupProvider";

export function CustomIdeaEditor({ onClose }: { onClose(): void }) {
  const { draft, dispatch } = useSetupDraft();
  const connection = useConvexConnectionState();
  const diagnostics = useDiagnostics();
  const openSession = useAction(api.heroIdeas.openSession);
  const prepare = useAction(api.heroIdeas.prepare);
  const transcribe = useAction(api.speech.transcribe);
  const confirm = useMutation(api.heroIdeaState.confirm);
  const cancelRequest = useMutation(api.heroIdeaState.cancel);
  const [busy, setBusy] = useState<
    | "recording"
    | "permission"
    | "transcribing"
    | "preparing"
    | "confirming"
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    ideaId: Id<"heroIdeas">;
    parts: { part: CustomChoice["part"]; label: string; description: string }[];
    clarification: string;
    base: string;
    expiresAt: number;
  } | null>(null);
  const epoch = useRef(0);
  const alive = useRef(true);
  const pending = useRef(false);
  const handle = useRef<RecordingHandle | null>(null);
  const capture = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<{ capability: string; requestId: string } | null>(
    null,
  );
  const current = useRef(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  const newRequestId = () =>
    `idea_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  const stopLocal = useCallback(() => {
    capture.current?.abort();
    capture.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const recorder = handle.current;
    handle.current = null;
    if (recorder) void recorder.cancel().catch(() => {});
  }, []);
  const abandon = useCallback(() => {
    epoch.current++;
    stopLocal();
    pending.current = false;
    const active = request.current;
    request.current = null;
    if (active) void cancelRequest(active).catch(() => {});
  }, [cancelRequest, stopLocal]);
  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener("change", (state) => {
      if (
        (state === "background" || (state === "inactive" && handle.current)) &&
        (pending.current || request.current || handle.current)
      ) {
        abandon();
        setBusy(null);
        setProposal(null);
        setError(
          "Recording or preparation paused. Your words and hero are kept.",
        );
      }
    });
    return () => {
      alive.current = false;
      abandon();
      listener.remove();
    };
  }, [abandon]);
  useFocusEffect(
    useCallback(
      () => () => {
        abandon();
        if (alive.current) {
          setBusy(null);
          setProposal(null);
        }
      },
      [abandon],
    ),
  );
  async function capability(run: number) {
    const existing = current.current.ideaCapability;
    if (existing && (current.current.ideaSessionExpiresAt ?? 0) > Date.now())
      return existing;
    const result = await openSession({});
    if (alive.current && run === epoch.current)
      dispatch({
        type: "setIdeaSession",
        capability: result.capability,
        expiresAt: result.expiresAt,
      });
    return result.capability;
  }
  function close() {
    abandon();
    onClose();
  }
  async function review() {
    if (
      pending.current ||
      !draft.ideaText.trim() ||
      !connection.isWebSocketConnected
    )
      return;
    pending.current = true;
    const run = ++epoch.current;
    setError(null);
    setProposal(null);
    setBusy("preparing");
    const context = draftContext(draft);
    const base = contextKey(context);
    try {
      const token = await capability(run);
      if (!alive.current || run !== epoch.current) return;
      const active = { capability: token, requestId: newRequestId() };
      request.current = active;
      const result = await diagnostics.track("hero_idea.prepare", () =>
        prepare({
          ...active,
          context,
          text: draft.ideaText,
          source: draft.ideaSource,
        }),
      );
      if (!alive.current || run !== epoch.current) return;
      if (contextKey(draftContext(current.current)) !== base)
        throw new Error("Your hero changed. Review the idea again.");
      setProposal({ ...result, base });
    } catch (cause) {
      if (alive.current && run === epoch.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not review the idea. Your words are kept.",
        );
    } finally {
      if (alive.current && run === epoch.current) {
        pending.current = false;
        setBusy(null);
      }
    }
  }
  async function apply() {
    if (!proposal?.parts.length || pending.current) return;
    pending.current = true;
    const run = ++epoch.current;
    setBusy("confirming");
    setError(null);
    try {
      const context = draftContext(current.current);
      if (contextKey(context) !== proposal.base)
        throw new Error("Your hero changed. Review the idea again.");
      const token = await capability(run);
      const parts = await confirm({
        capability: token,
        ideaId: proposal.ideaId,
        context,
        text: draft.ideaText,
      });
      if (!alive.current || run !== epoch.current) return;
      if (contextKey(draftContext(current.current)) !== proposal.base)
        throw new Error("Your hero changed. Review the idea again.");
      dispatch({
        type: "applyIdea",
        expectedContext: proposal.base,
        choices: parts.map((part) => ({
          ...part,
          kind: "custom",
          key: `custom_${part.part}`,
          ideaId: proposal.ideaId,
          source: draft.ideaSource,
          confirmedText: draft.ideaText.trim(),
          expiresAt: proposal.expiresAt,
        })),
      });
      request.current = null;
      onClose();
    } catch (cause) {
      if (alive.current && run === epoch.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not apply the idea. Your hero is kept.",
        );
    } finally {
      if (alive.current && run === epoch.current) {
        pending.current = false;
        setBusy(null);
      }
    }
  }
  async function stop() {
    const recorder = handle.current;
    if (!recorder) return;
    handle.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = epoch.current;
    setBusy("transcribing");
    try {
      const clip = await recorder.stop();
      const token = await capability(run);
      if (!alive.current || run !== epoch.current) return;
      const active = { capability: token, requestId: newRequestId() };
      request.current = active;
      const text = await diagnostics.track("hero_idea.transcribe", () =>
        transcribe({ ...active, ...clip }),
      );
      if (!alive.current || run !== epoch.current) return;
      dispatch({ type: "setIdeaText", text, source: "spoken" });
      setProposal(null);
    } catch (cause) {
      if (alive.current && run === epoch.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not hear that idea. You can type instead.",
        );
    } finally {
      if (alive.current && run === epoch.current) {
        pending.current = false;
        setBusy(null);
      }
    }
  }
  async function record() {
    if (pending.current || !connection.isWebSocketConnected) return;
    pending.current = true;
    const run = ++epoch.current;
    setBusy("permission");
    setError(null);
    setProposal(null);
    const controller = new AbortController();
    capture.current = controller;
    try {
      const recorder = await startRecording(controller.signal);
      if (!alive.current || run !== epoch.current) {
        await recorder.cancel();
        return;
      }
      handle.current = recorder;
      setBusy("recording");
      timer.current = setTimeout(() => {
        void stop();
      }, 20_000);
    } catch (cause) {
      if (alive.current && run === epoch.current) {
        pending.current = false;
        setBusy(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not record. You can type instead.",
        );
      }
    }
  }
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={setupStyles.sectionTitle}>
        Tell us your idea
      </Text>
      <Text style={setupStyles.muted}>
        Describe a character, outfit, quirk or extra detail. We’ll show what
        will change before you use it.
      </Text>
      <Field
        label="Your idea"
        value={draft.ideaText}
        multiline
        maxLength={500}
        editable={!busy}
        onChangeText={(text) => {
          setProposal(null);
          dispatch({ type: "setIdeaText", text, source: draft.ideaSource });
        }}
        placeholder="A blue cape, rainbow glasses and hiccups that make stars…"
      />
      <Text style={setupStyles.muted}>
        {draft.ideaText.length}/500 characters
      </Text>
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={setupStyles.muted}>
          {busy === "recording"
            ? "Recording… Up to 20 seconds."
            : busy === "permission"
              ? "Opening the microphone…"
              : busy === "transcribing"
                ? "Listening to your recording…"
                : busy === "confirming"
                  ? "Keeping your idea…"
                  : "Understanding and checking your idea…"}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {busy === "recording" ? (
          <WorkshopButton label="Stop recording" onPress={stop} />
        ) : (
          <WorkshopButton
            label="Speak your idea"
            variant="secondary"
            disabled={Boolean(busy) || !connection.isWebSocketConnected}
            onPress={record}
          />
        )}
        <WorkshopButton
          label="Review my idea"
          disabled={
            Boolean(busy) ||
            !draft.ideaText.trim() ||
            !connection.isWebSocketConnected
          }
          onPress={review}
        />
        {busy ? (
          <WorkshopButton
            label="Cancel this request"
            variant="secondary"
            onPress={() => {
              abandon();
              setBusy(null);
            }}
          />
        ) : null}
      </View>
      {!connection.isWebSocketConnected ? (
        <Text style={setupStyles.muted}>
          Reconnect to review or transcribe. Your words and choices are kept.
        </Text>
      ) : null}
      {proposal?.clarification ? (
        <Text accessibilityLiveRegion="polite" style={setupStyles.muted}>
          {proposal.clarification}
        </Text>
      ) : null}
      {proposal?.parts.length ? (
        <View style={styles.review}>
          <Text style={setupStyles.sectionTitle}>
            Here is what your hero will have
          </Text>
          {proposal.parts.map((part) => (
            <Text key={part.part} style={styles.body}>
              {part.part === "details"
                ? "Extra detail"
                : part.part[0].toUpperCase() + part.part.slice(1)}
              : {part.description}
            </Text>
          ))}
          <Text style={setupStyles.muted}>
            Your other choices stay as they are. Custom details are shown in
            words in the preview.
          </Text>
          <WorkshopButton
            label="Use this idea"
            disabled={Boolean(busy) || !connection.isWebSocketConnected}
            onPress={apply}
          />
          <WorkshopButton
            label="Edit the words"
            variant="secondary"
            disabled={Boolean(busy)}
            onPress={() => setProposal(null)}
          />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={setupStyles.error}>
          {error}
        </Text>
      ) : null}
      <WorkshopButton
        label="Back to hero choices"
        variant="secondary"
        onPress={close}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  review: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.mint,
    borderRadius: radii.card,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  body: { ...type.body, color: colors.ink },
});
