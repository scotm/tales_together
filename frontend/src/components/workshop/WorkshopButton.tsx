import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors, layout, radii, spacing, type } from "./theme";

export type WorkshopButtonVariant = "primary" | "secondary" | "shuffle";

const palette: Record<
  WorkshopButtonVariant,
  { background: string; depth: string; label: string; border: string }
> = {
  primary: {
    background: colors.ink,
    depth: colors.inkShadow,
    label: colors.surface,
    border: colors.ink,
  },
  secondary: {
    background: colors.surface,
    depth: colors.border,
    label: colors.ink,
    border: colors.border,
  },
  shuffle: {
    background: colors.apricot,
    depth: colors.apricotShadow,
    label: colors.ink,
    border: colors.apricot,
  },
};

/**
 * Primary, secondary and Shuffle actions. Depth is a bottom border that the
 * pressed state shortens with a small translation (§6).
 */
export function WorkshopButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  busyLabel,
  icon,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: WorkshopButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = palette[variant];
  const inactive = disabled || busy;
  const text = busy && busyLabel ? busyLabel : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={() => {
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderBottomColor: tone.depth,
        },
        pressed && !inactive && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={tone.label} /> : icon}
      <Text style={[styles.label, { color: tone.label }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 58,
    minWidth: layout.minTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.control + 4,
    borderWidth: 0,
    borderBottomWidth: 5,
  },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  inactive: { opacity: 0.55 },
  label: { ...type.button, textAlign: "center" },
});
