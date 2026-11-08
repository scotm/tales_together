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
  artSize = 96,
  role = "radio",
  disabled = false,
  style,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  art?: ReactNode;
  artSize?: number;
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
        <View style={styles.artWell}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.art, { width: artSize, height: artSize }]}
          >
            {art}
          </View>
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
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.ink },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  artWell: {
    width: "100%",
    maxWidth: 168,
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.card,
  },
  art: { alignItems: "center", justifyContent: "center" },
  text: { gap: 2, alignItems: "center" },
  label: { ...type.label, color: colors.ink, textAlign: "center" },
  description: { ...type.small, color: colors.mutedInk, textAlign: "center" },
  check: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
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
