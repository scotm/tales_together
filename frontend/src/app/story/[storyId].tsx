import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

  const [pitching, setPitching] = useState(false);
  const [writing, setWriting] = useState(false);
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

  const chapter = story.chapters[0];

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
        <Text style={styles.title}>{story.story.title}</Text>
        <Text style={styles.muted}>{story.story.worldState.setting}</Text>

        {chapter?.recapOneLiner ? (
          <Text style={styles.recap}>Previously: {chapter.recapOneLiner}</Text>
        ) : null}

        {chapter ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Chapter {chapter.index} · pick what happens
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

        {chapter && chapter.paragraphs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {chapter.title ?? `Chapter ${chapter.index}`}
            </Text>
            {chapter.paragraphs.map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              <Text key={`${chapter._id}-${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chapters</Text>
          {story.chapters.map((entry) => (
            <Text key={entry._id} style={styles.muted}>
              {entry.index} · {entry.status} · {entry.arcRole}
            </Text>
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
  error: { color: "#B91C1C" },
});
