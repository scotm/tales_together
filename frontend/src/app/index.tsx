import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
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

const SAMPLE = {
  title: "Barnaby and the Runaway Cake",
  setting: "An underwater bakery inside a giant sunken teapot",
  centralProblem:
    "The Royal Sponge Cake has grown wings and floated out the chimney",
  protagonistName: "Barnaby Whiskers",
  protagonistQuirk: "Hiccups floating rainbow bubbles whenever he gets nervous",
  visualDescription:
    "A small scruffy brown river otter wearing a tall crooked white chef hat and a red polka-dot apron",
  backpackItems: [
    { id: "item_whisk", name: "Golden Whisk" },
    { id: "item_jam", name: "Jar of Glow-Jam" },
    { id: "item_kazoo", name: "Grandma's Kazoo" },
  ],
};

export default function HomeScreen() {
  const router = useRouter();
  const stories = useQuery(api.stories.listRecent);
  const createStory = useMutation(api.stories.create);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startStory() {
    setCreating(true);
    setError(null);
    try {
      const storyId = await createStory(SAMPLE);
      router.push({ pathname: "/story/[storyId]", params: { storyId } });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start a story",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tales Together</Text>
        <Text style={styles.subtitle}>
          Put your child in the Director&apos;s Chair. Build a world, pick the
          plot, and publish a living storybook.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={startStory}
          disabled={creating}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {creating ? "Starting..." : "Start a story"}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent stories</Text>
          {stories === undefined ? <ActivityIndicator /> : null}
          {stories?.length === 0 ? (
            <Text style={styles.muted}>
              No stories yet. Make the first one.
            </Text>
          ) : null}
          {stories?.map((story) => (
            <Pressable
              key={story._id}
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  pathname: "/story/[storyId]",
                  params: { storyId: story._id },
                })
              }
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{story.title}</Text>
              <Text style={styles.muted}>
                {story.totalChapters} chapters · {story.readingLevel}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDF6E3" },
  content: {
    padding: 24,
    gap: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 36, fontWeight: "800", color: "#1F1A17" },
  subtitle: { fontSize: 16, lineHeight: 24, color: "#57534E" },
  button: {
    backgroundColor: "#F59E0B",
    borderBottomWidth: 6,
    borderBottomColor: "#B45309",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
  buttonLabel: { fontSize: 18, fontWeight: "700", color: "#1F1A17" },
  error: { color: "#B91C1C" },
  section: { marginTop: 24, gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#1F1A17" },
  muted: { color: "#78716C" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E7E5E4",
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: "#1F1A17" },
});
