import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, type } from "@/components/workshop/theme";
import type { StoryWorkshop } from "./useStoryWorkshop";
export function ChapterNavigation({ workshop }: { workshop: StoryWorkshop }) {
  const { story, chapter, activeChapter, setOpenId } = workshop;
  if (!story) return null;
  return (
    <View style={styles.markers}>
      {Array.from({ length: story.story.totalChapters }, (_, i) => {
        const entry = story.chapters.find((row) => row.index === i + 1);
        const completed = entry?.status === "LOCKED";
        const active = Boolean(entry && entry._id === activeChapter?._id);
        const selected = Boolean(entry && entry._id === chapter?._id);
        const enabled = completed || active;
        return (
          <Pressable
            // biome-ignore lint/suspicious/noArrayIndexKey: chapter numbers are fixed identities, never reordered.
            key={i + 1}
            accessibilityRole="button"
            accessibilityLabel={`Chapter ${i + 1}${entry?.title ? `: ${entry.title}` : ""}. ${completed ? "Read again" : active ? "Current chapter" : "Not ready yet"}`}
            accessibilityState={{ selected, disabled: !enabled }}
            disabled={!enabled}
            onPress={() => {
              if (entry) setOpenId(entry._id);
            }}
            style={[
              styles.marker,
              completed && styles.completed,
              selected && styles.selected,
              !enabled && styles.future,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedText]}>
              {i + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  markers: { flexDirection: "row", gap: 8 },
  marker: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  completed: { backgroundColor: colors.mint },
  selected: { backgroundColor: colors.ink },
  future: { opacity: 0.6 },
  label: { ...type.label, color: colors.ink },
  selectedText: { color: colors.surface },
});
