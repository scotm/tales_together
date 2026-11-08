import { StyleSheet } from "react-native";
import { colors, radii, spacing, type } from "@/components/workshop/theme";
export const storyStyles = StyleSheet.create({
  section: { gap: spacing.lg },
  title: { ...type.bookTitle, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  muted: { ...type.small, color: colors.mutedInk },
  error: { ...type.body, color: colors.danger },
  panel: {
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    alignItems: "center",
  },
});
