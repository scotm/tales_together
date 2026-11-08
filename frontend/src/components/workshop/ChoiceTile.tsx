import type { ReactNode } from "react";
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { colors, layout, radii, spacing, type } from "./theme";

/**
 * A labelled choice with a selection outline and check badge, so selection
 * never relies on colour alone. `role` is `radio` inside single-choice
 * groups and `checkbox` for multi-select (the backpack).
 */
export function ChoiceTile({
  label,
  description,
  selected,
  onPress,
  art,
  role = "radio",
  disabled = false,
  style,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  art?: ReactNode;
  role?: "radio" | "checkbox";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={
        role === "radio"
          ? { selected, checked: selected, disabled }
          : { checked: selected, disabled }
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {art ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.art}
        >
          {art}
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      {selected ? (
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: layout.minTarget + 12,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingRight: spacing.xxl + spacing.sm,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.ink, backgroundColor: colors.surface },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  art: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  label: { ...type.bodyStrong, color: colors.ink },
  description: { ...type.small, color: colors.mutedInk },
  check: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: {
    color: colors.surface,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: type.label.fontFamily,
  },
});
