import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";

export default function StoryScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const story = useQuery(api.stories.get, {
    storyId: storyId as Id<"stories">,
  });

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

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{story.story.title}</Text>
        <Text style={styles.muted}>{story.story.worldState.setting}</Text>

        {story.chapters.map((chapter) => (
          <Text key={chapter._id} style={styles.chapter}>
            Chapter {chapter.index} · {chapter.status} · {chapter.arcRole}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDF6E3", padding: 24 },
  content: { gap: 12 },
  title: { fontSize: 28, fontWeight: "800", color: "#1F1A17" },
  muted: { color: "#78716C" },
  chapter: { fontSize: 15, color: "#44403C" },
});
