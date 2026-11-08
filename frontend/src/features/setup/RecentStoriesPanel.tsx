import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, spacing, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import type { RecentStories } from "./useRecentStories";

/**
 * The last ten stories on this deployment. `listRecent` has no owner filter,
 * so this is not "your library". Opening/closing it keeps the setup draft.
 */
export function RecentStoriesPanel({
  recent,
  onClose,
}: {
  recent: RecentStories;
  onClose: () => void;
}) {
  const router = useRouter();
  const { stories } = recent;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          Recent stories
        </Text>
        <WorkshopButton
          label="Back to the workshop"
          variant="secondary"
          onPress={onClose}
        />
      </View>
      {recent.loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            accessibilityLabel="Loading recent stories"
            color={colors.ink}
          />
          <Text style={styles.muted}>Connecting to the story shelf…</Text>
        </View>
      ) : null}
      {recent.stalled && !stories ? (
        <Text style={styles.muted}>
          Recent stories will appear once we reconnect.
        </Text>
      ) : null}
      {stories?.length === 0 ? (
        <Text style={styles.muted}>No stories yet. Make the first one.</Text>
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
          style={styles.row}
        >
          <Text style={styles.rowTitle}>{story.title}</Text>
          <Text style={styles.muted}>{story.totalChapters} chapters</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heading: { ...type.heading, color: colors.ink },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muted: { ...type.small, color: colors.mutedInk },
  row: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowTitle: { ...type.cardTitle, color: colors.ink },
});
