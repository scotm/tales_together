import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function StoryScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const story = useQuery(api.stories.get, {
    storyId: storyId as Id<"stories">,
  });
  const pitchChapter = useAction(api.chapters.pitchChapter);
  const writeChapter = useAction(api.chapters.writeChapter);
  const chooseBeat = useMutation(api.chapters.chooseBeat);
  const lockChapter = useMutation(api.chapters.lockChapter);

  const [pitching, setPitching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [locking, setLocking] = useState(false);
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

  async function deal() {
    if (!chapter) return;
    setPitching(true);
    setError(null);
    try {
      await pitchChapter({ chapterId: chapter._id });
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
      await chooseBeat({ chapterId: chapter._id, cardId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pick");
    }
  }

  async function nextChapter() {
    if (!chapter) return;
    setLocking(true);
    setError(null);
    try {
      await lockChapter({ chapterId: chapter._id });
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
      await writeChapter({ chapterId: chapter._id });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not write the chapter",
      );
    } finally {
      setWriting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {story.story.coverUrl ? (
          <Image
            accessibilityLabel="Book cover"
            source={{ uri: story.story.coverUrl }}
            style={styles.cover}
          />
        ) : null}
        <Text style={styles.title}>{story.story.title}</Text>
        <Text style={styles.muted}>{story.story.worldState.setting}</Text>

        {chapter?.recapOneLiner ? (
          <Text style={styles.recap}>Previously: {chapter.recapOneLiner}</Text>
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

            {chapter.beatCards.map((card) => (
              <Pressable
                key={card.cardId}
                accessibilityRole="button"
                accessibilityState={{
                  selected: chapter.chosenBeat?.cardId === card.cardId,
                }}
                onPress={() => pick(card.cardId)}
                disabled={writing || chapter.paragraphs.length > 0}
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
                {card.suggestedItemId ? (
                  <Text style={styles.badge}>🎒 {card.suggestedItemId}</Text>
                ) : null}
              </Pressable>
            ))}

            {chapter.chosenBeat && chapter.paragraphs.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={write}
                disabled={writing}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonLabel}>
                  {writing ? "Writing..." : "🪄 Write Chapter!"}
                </Text>
              </Pressable>
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

        {story.story.epubUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(story.story.epubUrl as string)}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonLabel}>📖 Download the Book</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
                {entry.status === "LOCKED" ? "read again" : entry.status}
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
