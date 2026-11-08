import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CONVEYOR_ITEMS } from "@convex/catalog";
import {
  useAction,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { useQueryDiagnostics } from "@/lib/diagnostics/query";
import {
  drawingPhrases,
  useRotatingPhrase,
  writingPhrases,
} from "@/lib/loadingPhrases";
import { recapSentence } from "@/lib/recap";
import { bookDeliveryLabel, saveBook } from "@/lib/saveBook";

/** Kid-facing words for the chapter's internal workflow state. */
const chapterStatusLabel = {
  PITCHING: "dealing cards…",
  DIRECTING: "choose a card",
  WRITING: "writing…",
  REVIEWING: "read it",
  LOCKED: "read again",
} as const;

/**
 * Provider calls can run for a minute, so say something is happening. Mounted
 * only while the work runs; `timeoutMs` hides it when the work will never
 * arrive (art generation can be switched off server-side).
 */
function Working({
  phrases,
  timeoutMs,
}: {
  phrases: readonly string[];
  timeoutMs?: number;
}) {
  const phrase = useRotatingPhrase(phrases);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!timeoutMs) return;
    const timer = setTimeout(() => setExpired(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);
  if (expired) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.working}>
      <ActivityIndicator />
      <Text style={styles.muted}>{phrase}…</Text>
    </View>
  );
}

export default function StoryScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  const diagnostics = useDiagnostics();
  const connection = useConvexConnectionState();
  const story = useQuery(api.stories.get, {
    storyId: storyId as Id<"stories">,
  });
  useQueryDiagnostics("stories.get", story, connection.isWebSocketConnected);
  const pitchChapter = useAction(api.chapters.pitchChapter);
  const writeChapter = useAction(api.chapters.writeChapter);
  const chooseBeat = useMutation(api.chapters.chooseBeat);
  const lockChapter = useMutation(api.chapters.lockChapter);
  const retryExport = useMutation(api.exportJobs.retry);

  const [pitching, setPitching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queuingExport, setQueuingExport] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (story === undefined) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (story === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.title}>Story not found</Text>
      </SafeAreaView>
    );
  }

  const allLocked = story.chapters.every((entry) => entry.status === "LOCKED");
  const activeChapter =
    story.chapters.find((entry) => entry.status !== "LOCKED") ??
    story.chapters[story.chapters.length - 1];
  // A finished chapter can be reopened from the list without leaving the story.
  const chapter =
    story.chapters.find((entry) => entry._id === openId) ?? activeChapter;
  const isWriting =
    writing || (chapter?.status === "WRITING" && Boolean(chapter.writingRunId));
  const exportBusy =
    queuingExport ||
    story.story.exportStatus === "PREPARING_COVER" ||
    story.story.exportStatus === "BUILDING";

  async function deal() {
    if (!chapter) return;
    setPitching(true);
    setError(null);
    try {
      await diagnostics.track("chapters.pitch", (operationId) =>
        pitchChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not deal the cards",
      );
    } finally {
      setPitching(false);
    }
  }

  async function pick(cardId: string) {
    if (!chapter) return;
    setError(null);
    try {
      await diagnostics.track("chapters.chooseBeat", () =>
        chooseBeat({ chapterId: chapter._id, cardId }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pick");
    }
  }

  async function nextChapter() {
    if (!chapter) return;
    setLocking(true);
    setError(null);
    try {
      await diagnostics.track("chapters.lock", (operationId) =>
        lockChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not turn the page",
      );
    } finally {
      setLocking(false);
    }
  }

  async function write() {
    if (!chapter) return;
    setWriting(true);
    setError(null);
    try {
      await diagnostics.track("chapters.write", (operationId) =>
        writeChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't finish this chapter. Your choice is saved. Try again.",
      );
    } finally {
      setWriting(false);
    }
  }

  async function prepareDownload() {
    setQueuingExport(true);
    setError(null);
    try {
      await diagnostics.track("export.retry", (operationId) =>
        retryExport({
          storyId: storyId as Id<"stories">,
          clientOperationId: operationId,
        }),
      );
    } catch {
      setError("We couldn't prepare the download. Try again.");
    } finally {
      setQueuingExport(false);
    }
  }

  async function download() {
    if (!story?.story.epubUrl) return;
    setSaving(true);
    setError(null);
    try {
      await diagnostics.track("delivery.save_book", () =>
        saveBook(
          story.story.epubUrl as string,
          story.story.title,
          (stage, fields) =>
            diagnostics.record(`delivery.${stage}`, fields ?? {}),
        ),
      );
    } catch {
      setError("We couldn't save the book. Your download is ready; try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/diagnostics")}
          style={styles.help}
        >
          <Text style={styles.helpLabel}>Help &amp; diagnostics</Text>
        </Pressable>
        {story.story.coverUrl ? (
          <Image
            accessibilityLabel="Book cover"
            source={{ uri: story.story.coverUrl }}
            resizeMode="contain"
            style={styles.cover}
          />
        ) : null}
        <Text style={styles.title}>{story.story.title}</Text>
        <Text style={styles.muted}>{story.story.worldState.setting}</Text>

        {chapter?.recapOneLiner ? (
          <Text style={styles.recap}>
            Previously: {recapSentence(chapter.recapOneLiner)}
          </Text>
        ) : null}

        {chapter ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {chapter.paragraphs.length > 0
                ? (chapter.title ?? `Chapter ${chapter.index}`)
                : `Chapter ${chapter.index} · pick what happens`}
            </Text>

            {chapter.beatCards.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={deal}
                disabled={pitching}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonLabel}>
                  {pitching ? "Dealing..." : "🃏 Deal 3 cards"}
                </Text>
              </Pressable>
            ) : null}

            {chapter.beatCards.map((card) => {
              const item = CONVEYOR_ITEMS.find(
                (entry) => entry.id === card.suggestedItemId,
              );
              return (
                <Pressable
                  key={card.cardId}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: chapter.chosenBeat?.cardId === card.cardId,
                  }}
                  onPress={() => pick(card.cardId)}
                  disabled={
                    isWriting ||
                    chapter.status === "WRITING" ||
                    chapter.paragraphs.length > 0
                  }
                  style={[
                    styles.card,
                    chapter.chosenBeat?.cardId === card.cardId &&
                      styles.cardPicked,
                  ]}
                >
                  <Text style={styles.cardTitle}>
                    {card.iconEmoji} {card.title}
                  </Text>
                  <Text style={styles.cardPitch}>{card.kidFriendlyPitch}</Text>
                  {item ? (
                    <Text style={styles.badge}>🎒 {item.label}</Text>
                  ) : null}
                </Pressable>
              );
            })}

            {isWriting ? <Working phrases={writingPhrases} /> : null}
            {chapter.chosenBeat && chapter.paragraphs.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={write}
                disabled={isWriting}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonLabel}>
                  {isWriting
                    ? "Writing..."
                    : chapter.writingError || chapter.status === "WRITING"
                      ? "Try Chapter Again"
                      : "🪄 Write Chapter!"}
                </Text>
              </Pressable>
            ) : null}
            {isWriting && chapter.writingRetry ? (
              <Text accessibilityLiveRegion="polite" style={styles.muted}>
                The storyteller is taking a moment. Trying again (
                {chapter.writingRetry.attempt}/
                {chapter.writingRetry.maxAttempts})…
              </Text>
            ) : null}
            {chapter.writingError && !isWriting ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {chapter.writingError}
              </Text>
            ) : null}
          </View>
        ) : null}

        {chapter?.illustrationUrl ? (
          <Image
            accessibilityLabel={`Illustration for chapter ${chapter.index}`}
            source={{ uri: chapter.illustrationUrl }}
            style={styles.illustration}
          />
        ) : null}

        {chapter && chapter.paragraphs.length > 0 ? (
          <View style={styles.section}>
            {chapter.illustrationUrl ||
            chapter.extractionStatus === "FAILED" ? null : (
              <Working phrases={drawingPhrases} timeoutMs={90_000} />
            )}
            {chapter.paragraphs.map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              <Text key={`${chapter._id}-${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ) : null}

        {chapter?.status === "REVIEWING" ? (
          <Pressable
            accessibilityRole="button"
            onPress={nextChapter}
            disabled={locking}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>
              {locking
                ? "Turning..."
                : chapter.index === story.story.totalChapters
                  ? "🎉 Finish the Book!"
                  : "Next Chapter →"}
            </Text>
          </Pressable>
        ) : null}

        {allLocked ? <Text style={styles.theEnd}>The End 🎉</Text> : null}

        {allLocked && exportBusy ? (
          <View accessibilityLiveRegion="polite" style={styles.section}>
            <ActivityIndicator />
            <Text style={styles.muted}>
              {story.story.exportStatus === "PREPARING_COVER"
                ? "Painting your cover…"
                : "Preparing your book…"}
            </Text>
            {story.story.exportRetry ? (
              <Text style={styles.muted}>
                The illustrator is taking a moment. Trying again (
                {story.story.exportRetry.attempt}/
                {story.story.exportRetry.maxAttempts})…
              </Text>
            ) : null}
          </View>
        ) : null}

        {allLocked && story.story.exportError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {story.story.exportError}
          </Text>
        ) : null}
        {allLocked && story.story.exportWarning && !exportBusy ? (
          <Text style={styles.muted}>{story.story.exportWarning}</Text>
        ) : null}
        {allLocked &&
        !exportBusy &&
        (!story.story.epubUrl ||
          story.story.exportStatus === "FAILED" ||
          story.story.exportWarning) ? (
          <Pressable
            accessibilityRole="button"
            onPress={prepareDownload}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>
              {story.story.exportStatus === "FAILED"
                ? "Try Download Again"
                : story.story.exportWarning
                  ? "Try Cover Again"
                  : "Prepare Download"}
            </Text>
          </Pressable>
        ) : null}

        {story.story.epubUrl && !exportBusy ? (
          <Pressable
            accessibilityRole="button"
            onPress={download}
            disabled={saving}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>
              {saving ? "Preparing file…" : bookDeliveryLabel}
            </Text>
          </Pressable>
        ) : null}

        {error && error !== chapter?.writingError ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chapters</Text>
          {story.chapters.map((entry) => (
            <Pressable
              key={entry._id}
              accessibilityRole="button"
              accessibilityState={{ selected: entry._id === chapter._id }}
              onPress={() => setOpenId(entry._id)}
              style={[
                styles.chapterRow,
                entry._id === chapter._id && styles.chapterRowOpen,
              ]}
            >
              <Text style={styles.chapterLabel}>
                {entry.index} · {entry.title ?? entry.arcRole}
              </Text>
              <Text style={styles.muted}>
                {chapterStatusLabel[entry.status]}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDF6E3", padding: 24 },
  content: { gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  help: { alignSelf: "flex-start", paddingVertical: 4 },
  helpLabel: { fontSize: 15, color: "#92400E" },
  title: { fontSize: 28, fontWeight: "800", color: "#1F1A17" },
  cover: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 2 / 3,
    borderRadius: 14,
    alignSelf: "center",
  },
  illustration: { width: "100%", aspectRatio: 4 / 3, borderRadius: 14 },
  muted: { color: "#78716C" },
  recap: { fontSize: 15, color: "#57534E", fontStyle: "italic" },
  section: { marginTop: 16, gap: 8 },
  working: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 19, fontWeight: "700", color: "#1F1A17" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E7E5E4",
    borderBottomWidth: 5,
    padding: 16,
    gap: 4,
  },
  cardPicked: { borderColor: "#F59E0B", backgroundColor: "#FFFBEB" },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#1F1A17" },
  cardPitch: { fontSize: 15, color: "#44403C" },
  badge: { fontSize: 13, color: "#92400E" },
  button: {
    backgroundColor: "#F59E0B",
    borderBottomWidth: 6,
    borderBottomColor: "#B45309",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
  buttonLabel: { fontSize: 17, fontWeight: "700", color: "#1F1A17" },
  paragraph: { fontSize: 18, lineHeight: 28, color: "#292524" },
  theEnd: { fontSize: 24, fontWeight: "800", color: "#1F1A17" },
  chapterRow: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  chapterRowOpen: { backgroundColor: "#FEF3C7" },
  chapterLabel: { fontSize: 15, fontWeight: "600", color: "#1F1A17" },
  error: { color: "#B91C1C" },
});
