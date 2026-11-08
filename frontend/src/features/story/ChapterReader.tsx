import { Image, StyleSheet, Text, View } from "react-native";
import {
  colors,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { drawingPhrases } from "@/lib/loadingPhrases";
import { storyStyles } from "./storyStyles";
import type { StoryWorkshop } from "./useStoryWorkshop";
import { Working } from "./Working";
export function ChapterReader({ workshop }: { workshop: StoryWorkshop }) {
  const {
    story,
    chapter,
    viewingActive,
    locking,
    nextChapter,
    activeChapter,
    setOpenId,
  } = workshop;
  if (!story || !chapter) return null;
  return (
    <View style={styles.column}>
      <Text style={styles.eyebrow}>
        Chapter {chapter.index} of {story.story.totalChapters}
      </Text>
      <Text accessibilityRole="header" style={styles.title}>
        {chapter.title ?? `Chapter ${chapter.index}`}
      </Text>
      {chapter.illustrationUrl ? (
        <Image
          accessibilityLabel={`Illustration for chapter ${chapter.index}`}
          source={{ uri: chapter.illustrationUrl }}
          style={styles.illustration}
          resizeMode="contain"
        />
      ) : chapter.extractionStatus === "PENDING" ||
        chapter.extractionStatus === "RUNNING" ? (
        <Working phrases={drawingPhrases} timeoutMs={90_000} />
      ) : null}
      {chapter.paragraphs.map((paragraph, index) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are immutable within this chapter.
          key={`${chapter._id}-${index}`}
          style={styles.paragraph}
        >
          {paragraph}
        </Text>
      ))}
      {viewingActive && chapter.status === "REVIEWING" ? (
        <WorkshopButton
          label={
            chapter.index === story.story.totalChapters
              ? "Finish the book!"
              : "Next chapter →"
          }
          busy={locking}
          busyLabel="Turning…"
          disabled={!workshop.connection.isWebSocketConnected}
          onPress={nextChapter}
        />
      ) : null}
      {!viewingActive && activeChapter ? (
        <WorkshopButton
          label="Return to the current chapter"
          variant="secondary"
          onPress={() => setOpenId(activeChapter._id)}
        />
      ) : null}
      {chapter.extractionStatus === "FAILED" ? (
        <Text style={storyStyles.muted}>
          Your chapter is saved and ready to read.
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  column: {
    width: "100%",
    maxWidth: layout.readingMaxWidth,
    alignSelf: "center",
    gap: spacing.xl,
    paddingBottom: spacing.xl,
  },
  eyebrow: { ...type.eyebrow, color: colors.mutedInk },
  title: {
    ...type.storyTitle,
    fontSize: 44,
    lineHeight: 54,
    color: colors.ink,
  },
  illustration: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radii.card,
    backgroundColor: colors.mint,
  },
  paragraph: { ...type.prose, color: colors.ink },
});
