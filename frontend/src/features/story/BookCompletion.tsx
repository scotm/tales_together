import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import {
  colors,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { bookDeliveryLabel } from "@/lib/saveBook";
import { storyStyles } from "./storyStyles";
import type { StoryWorkshop } from "./useStoryWorkshop";
export function BookCompletion({ workshop }: { workshop: StoryWorkshop }) {
  const { story, allLocked, exportBusy, saving, prepareDownload, download } =
    workshop;
  if (!story || !allLocked) return null;
  const book = story.story;
  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>A book made together</Text>
      <Text accessibilityRole="header" style={styles.heading}>
        The End 🎉
      </Text>
      {book.coverUrl ? (
        <Image
          accessibilityLabel="Book cover"
          source={{ uri: book.coverUrl }}
          resizeMode="contain"
          style={styles.cover}
        />
      ) : (
        <View style={styles.coverFallback}>
          <Text style={styles.bookTitle}>{book.title}</Text>
        </View>
      )}
      <Text style={styles.bookTitle}>{book.title}</Text>
      <Text style={storyStyles.body}>
        Written by {book.authorName || "A Young Author"}
      </Text>
      <Text style={storyStyles.muted}>
        All {book.totalChapters} chapters are kept. Read them again below, or
        save your storybook.
      </Text>
      {exportBusy ? (
        <View accessibilityLiveRegion="polite" style={storyStyles.section}>
          <ActivityIndicator />
          <Text style={storyStyles.body}>
            {book.exportStatus === "PREPARING_COVER"
              ? "Painting your cover…"
              : "Preparing your book…"}
          </Text>
          {book.exportRetry ? (
            <Text style={storyStyles.muted}>
              The illustrator is taking a moment. Trying again (
              {book.exportRetry.attempt}/{book.exportRetry.maxAttempts})…
            </Text>
          ) : null}
        </View>
      ) : null}
      {book.exportError ? (
        <Text accessibilityRole="alert" style={storyStyles.error}>
          {book.exportError}
        </Text>
      ) : null}
      {book.exportWarning && !exportBusy ? (
        <Text style={storyStyles.muted}>{book.exportWarning}</Text>
      ) : null}
      {!exportBusy &&
      (!book.epubUrl ||
        book.exportStatus === "FAILED" ||
        book.exportWarning) ? (
        <WorkshopButton
          label={
            book.exportStatus === "FAILED"
              ? "Try download again"
              : book.exportWarning
                ? "Try cover again"
                : "Prepare download"
          }
          variant="secondary"
          disabled={!workshop.connection.isWebSocketConnected}
          onPress={prepareDownload}
        />
      ) : null}
      {book.epubUrl && !exportBusy ? (
        <WorkshopButton
          label={bookDeliveryLabel}
          busy={saving}
          busyLabel="Preparing file…"
          onPress={download}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.panel,
    backgroundColor: colors.mint,
    maxWidth: layout.readingMaxWidth,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: { ...type.eyebrow, color: colors.ink },
  heading: { ...type.heading, color: colors.ink },
  cover: {
    width: "100%",
    maxWidth: 300,
    aspectRatio: 2 / 3,
    alignSelf: "center",
    borderRadius: radii.control,
  },
  coverFallback: {
    minHeight: 180,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.control,
  },
  bookTitle: { ...type.bookTitle, color: colors.ink },
});
