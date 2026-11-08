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
  display = false,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  /** The world step uses the oversized "What if…" treatment. */
  display?: boolean;
}) {
  const { width } = useWindowDimensions();
  const titleStyle = display
    ? [
        type.display,
        { fontSize: width < layout.phoneMaxWidth ? 48 : 76 },
        { lineHeight: width < layout.phoneMaxWidth ? 58 : 92 },
      ]
    : [
        type.chapter,
        { fontSize: width < layout.phoneMaxWidth ? 34 : 56 },
        { lineHeight: width < layout.phoneMaxWidth ? 42 : 64 },
      ];
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={[styles.title, titleStyle]}>
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
  variant = "tabs",
}: {
  current: SetupStep;
  onSelect: (step: SetupStep) => void;
  /** `crumb` matches the hero and backpack frames; `tabs` matches world. */
  variant?: "tabs" | "crumb";
}) {
  const currentIndex = STEPS.findIndex((entry) => entry.step === current);
  const crumb = variant === "crumb";
  const { width } = useWindowDimensions();
  const compact = width < layout.phoneMaxWidth && !crumb;
  return (
    <View
      accessibilityRole="tablist"
      style={crumb ? styles.crumbs : styles.progress}
    >
      {STEPS.map((entry, index) => {
        const active = entry.step === current;
        const done = index < currentIndex;
        return (
          <View key={entry.step} style={styles.crumbWrap}>
            {crumb && index > 0 ? (
              <Text style={styles.crumbSeparator}>/</Text>
            ) : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Step ${index + 1} of 3: ${entry.label}`}
              onPress={() => onSelect(entry.step)}
              style={[
                styles.progressItem,
                crumb && styles.crumbItem,
                !crumb && done && styles.progressDone,
                !crumb && active && styles.progressActive,
              ]}
            >
              <Text
                style={[
                  crumb ? styles.crumbLabel : styles.progressLabel,
                  compact && styles.progressLabelCompact,
                  !crumb && active && styles.progressLabelOn,
                  crumb && active && styles.crumbLabelOn,
                ]}
              >
                {crumb
                  ? `${entry.label.toUpperCase()} ${done ? "✓" : String(index + 1).padStart(2, "0")}`
                  : `${done ? "✓ " : `${String(index + 1).padStart(2, "0")}  `}${entry.label}`}
              </Text>
            </Pressable>
          </View>
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
  heading: { gap: spacing.sm },
  eyebrow: { ...type.eyebrow, color: colors.mutedInk },
  title: { color: colors.ink },
  lede: { ...type.intro, color: colors.mutedInk, maxWidth: 725 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.sm,
  },
  cell: { padding: spacing.sm, flexGrow: 0, flexShrink: 0 },
  progress: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
  },
  progressItem: {
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: 218,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  progressDone: { backgroundColor: colors.mint },
  progressActive: { backgroundColor: colors.ink },
  progressLabel: { ...type.label, color: colors.ink, textAlign: "center" },
  progressLabelCompact: { fontSize: 13 },
  progressLabelOn: { color: colors.surface },
  crumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  crumbWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  crumbSeparator: { ...type.eyebrow, color: colors.border },
  crumbItem: {
    flexGrow: 0,
    flexBasis: "auto",
    maxWidth: 9999,
    minHeight: layout.minTarget,
    justifyContent: "center",
    paddingHorizontal: 0,
    backgroundColor: "transparent",
  },
  crumbLabel: { ...type.eyebrow, color: colors.mutedInk },
  crumbLabelOn: { color: colors.ink },
  field: { gap: spacing.sm },
  fieldLabel: { ...type.label, color: colors.ink },
  input: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fontFaces.regular,
    fontSize: 19,
  },
  inputFocused: { borderWidth: 2, borderColor: colors.ink },
  inputError: { borderWidth: 2, borderColor: colors.danger },
  error: { ...type.small, color: colors.danger },
  hint: { ...type.small, color: colors.mutedInk },
  panel: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
