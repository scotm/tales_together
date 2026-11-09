import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { layout, spacing } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import {
  HeaderButton,
  WorkshopShell,
} from "@/components/workshop/WorkshopShell";
import { RequireSignIn } from "@/features/auth/RequireSignIn";
import { BookCompletion } from "@/features/story/BookCompletion";
import { ChapterDirector } from "@/features/story/ChapterDirector";
import { ChapterNavigation } from "@/features/story/ChapterNavigation";
import { ChapterReader } from "@/features/story/ChapterReader";
import { storyStyles } from "@/features/story/storyStyles";
import { useStoryWorkshop } from "@/features/story/useStoryWorkshop";
import { useReconnectBackend } from "@/lib/BackendProvider";
import { rememberStory } from "@/lib/storyShelf";

export default function StoryScreen() {
  return (
    <RequireSignIn>
      <Story />
    </RequireSignIn>
  );
}

function Story() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reconnect = useReconnectBackend();
  const workshop = useStoryWorkshop(storyId);
  const { story, chapter, allLocked, error, connection } = workshop;
  const [timedOut, setTimedOut] = useState(false);
  const found = Boolean(story);
  useEffect(() => {
    if (found) void rememberStory(storyId);
  }, [found, storyId]);
  useEffect(() => {
    if (story !== undefined) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [story]);
  return (
    <WorkshopShell
      headerActions={
        <HeaderButton
          label="Back to the workshop"
          onPress={() => router.push("/")}
        />
      }
    >
      {!connection.isWebSocketConnected ? (
        <Text accessibilityLiveRegion="polite" style={storyStyles.muted}>
          You’re offline. Your saved chapters are kept; reconnect to make more.
        </Text>
      ) : null}
      {story === undefined ? (
        <>
          <Text accessibilityRole="header" style={storyStyles.title}>
            Opening your story
          </Text>
          {timedOut ? (
            <>
              <Text style={storyStyles.muted}>
                The story is taking too long to load. Check the connection and
                try again.
              </Text>
              <WorkshopButton
                label="Try connecting again"
                variant="secondary"
                disabled={Boolean(
                  connection.inflightActions || connection.inflightMutations,
                )}
                onPress={reconnect}
              />
            </>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading story" />
          )}
        </>
      ) : story === null ? (
        <>
          <Text accessibilityRole="header" style={storyStyles.title}>
            Story not found
          </Text>
          <Text style={storyStyles.body}>
            Check the story link, or return to the workshop to make a new book.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.titleRow}>
            <Text
              accessibilityRole="header"
              style={[
                storyStyles.title,
                width < layout.phoneMaxWidth && styles.phoneTitle,
              ]}
            >
              {story.story.title}
            </Text>
            <ChapterNavigation workshop={workshop} />
          </View>
          {error && error !== chapter?.writingError ? (
            <Text accessibilityRole="alert" style={storyStyles.error}>
              {error}
            </Text>
          ) : null}
          <BookCompletion workshop={workshop} />
          {chapter?.paragraphs.length ? (
            <ChapterReader key={chapter._id} workshop={workshop} />
          ) : !allLocked ? (
            <ChapterDirector workshop={workshop} />
          ) : null}
        </>
      )}
    </WorkshopShell>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  phoneTitle: { fontSize: 32, lineHeight: 40 },
});
