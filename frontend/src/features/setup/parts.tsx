import { type ReactNode, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  useWindowDimensions,
  View,
} from "react-native";
import {
  colors,
  fontFaces,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import type { SetupStep } from "./draft";

export function StepHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {lede ? <Text style={styles.lede}>{lede}</Text> : null}
    </View>
  );
}

/** Wide desktop gets four columns; phones and narrow tablets get two. */
export function useShelfColumns(wide = 4, narrow = 2) {
  const { width } = useWindowDimensions();
  return width >= layout.splitMinWidth ? wide : narrow;
}

export function ChoiceGrid({
  columns,
  label,
  multiSelect = false,
  children,
}: {
  columns: number;
  label: string;
  multiSelect?: boolean;
  children: ReactNode[];
}) {
  const basis = `${100 / columns}%` as const;
  return (
    <View
      accessibilityRole={multiSelect ? "list" : "radiogroup"}
      accessibilityLabel={label}
      style={styles.grid}
    >
      {children.map((child, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: children are keyed
        <View key={index} style={[styles.cell, { flexBasis: basis }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const STEPS: { step: SetupStep; label: string }[] = [
  { step: "world", label: "World" },
  { step: "hero", label: "Hero" },
  { step: "backpack", label: "Backpack" },
];

/** Colours describe progress, not a server save or a locked choice. */
export function StepProgress({
  current,
  onSelect,
}: {
  current: SetupStep;
  onSelect: (step: SetupStep) => void;
}) {
  const currentIndex = STEPS.findIndex((entry) => entry.step === current);
  return (
    <View accessibilityRole="tablist" style={styles.progress}>
      {STEPS.map((entry, index) => {
        const active = entry.step === current;
        const done = index < currentIndex;
        return (
          <Pressable
            key={entry.step}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Step ${index + 1} of 3: ${entry.label}`}
            onPress={() => onSelect(entry.step)}
            style={[
              styles.progressItem,
              done && styles.progressDone,
              active && styles.progressActive,
            ]}
          >
            <Text
              style={[styles.progressLabel, active && styles.progressLabelOn]}
            >
              {done ? "✓ " : `${index + 1} · `}
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  inputRef,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  inputRef?: React.Ref<TextInputInstance>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.mutedInk}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
        {...input}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export const setupStyles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  muted: { ...type.small, color: colors.mutedInk },
  error: { ...type.small, color: colors.danger },
  sectionTitle: { ...type.title, color: colors.ink },
});

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  eyebrow: { ...type.eyebrow, color: colors.violet },
  title: { ...type.heading, color: colors.ink },
  lede: { ...type.body, color: colors.mutedInk, maxWidth: 640 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xs,
  },
  cell: { padding: spacing.xs, flexGrow: 0, flexShrink: 0 },
  progress: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  progressItem: {
    minHeight: layout.minTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  progressDone: { backgroundColor: colors.mint, borderColor: colors.mint },
  progressActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  progressLabel: { ...type.label, color: colors.ink },
  progressLabelOn: { color: colors.surface },
  field: { gap: spacing.xs },
  fieldLabel: { ...type.label, color: colors.ink },
  input: {
    minHeight: layout.minTarget + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fontFaces.regular,
    fontSize: 17,
  },
  inputFocused: { borderColor: colors.violet },
  inputError: { borderColor: colors.danger },
  error: { ...type.small, color: colors.danger },
  hint: { ...type.small, color: colors.mutedInk },
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.panel,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
