import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, layout, radii, spacing, type } from "./theme";

const SHOW_WORKSHOP_PILL = 900;

/**
 * Brand header, safe areas, content width and the footer shared by every
 * workshop screen: book mark and lowercase wordmark, a centred workshop pill,
 * the page action, then a chalky divider and Help as a quiet footer link.
 */
export function WorkshopShell({
  children,
  headerActions,
  maxWidth = layout.contentMaxWidth,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  maxWidth?: number;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const phone = width < layout.phoneMaxWidth;
  const gutter = phone ? spacing.phoneGutter : spacing.desktopGutter;
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter }]}
        >
          <View style={[styles.frame, { maxWidth }]}>
            <View style={styles.header}>
              <View style={styles.brand}>
                <BookMark size={phone ? 36 : 42} />
                <Text
                  accessibilityRole="header"
                  style={[styles.wordmark, phone && styles.wordmarkPhone]}
                >
                  tales together
                </Text>
              </View>
              {width >= SHOW_WORKSHOP_PILL ? (
                <View style={styles.pill}>
                  <Text style={styles.pillLabel}>YOUR STORY WORKSHOP</Text>
                </View>
              ) : null}
              <View style={styles.actions}>{headerActions}</View>
            </View>
            <View style={styles.rule} />
            <View style={styles.content}>{children}</View>
            <View style={styles.rule} />
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Made for curious minds, big and small.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Help & diagnostics"
                onPress={() => router.push("/diagnostics")}
                style={styles.footerLink}
              >
                <Text style={styles.footerLinkLabel}>Need a hand?</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Small outlined header control, e.g. Recent stories. */
export function HeaderButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const phone = width < layout.phoneMaxWidth;
  const text = phone
    ? label === "Recent stories"
      ? "Recent"
      : label === "Back to the workshop"
        ? "← Workshop"
        : label
    : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        phone && styles.headerButtonPhone,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.headerButtonLabel}>{text}</Text>
    </Pressable>
  );
}

/** The two-page book mark from the design, drawn from rounded blocks. */
export function BookMark({ size = 42 }: { size?: number }) {
  const pageWidth = size * 0.24;
  const pageHeight = size * 0.45;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size * 0.28 },
      ]}
    >
      <View
        style={[
          styles.page,
          {
            width: pageWidth,
            height: pageHeight,
            left: size * 0.24,
            top: size * 0.26,
            backgroundColor: colors.paper,
          },
        ]}
      />
      <View
        style={[
          styles.page,
          {
            width: pageWidth,
            height: pageHeight,
            left: size * 0.52,
            top: size * 0.26,
            backgroundColor: colors.apricot,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1, paddingVertical: spacing.xl },
  frame: { width: "100%", alignSelf: "center", flexGrow: 1 },
  header: {
    minHeight: 46,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  mark: {
    justifyContent: "center",
    alignItems: "flex-start",
    backgroundColor: colors.ink,
  },
  page: {
    position: "absolute",
    borderRadius: 2,
  },
  wordmark: { ...type.title, fontSize: 25, lineHeight: 32, color: colors.ink },
  wordmarkPhone: { fontSize: 20, lineHeight: 26 },
  pill: {
    minHeight: 40,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  pillLabel: { ...type.label, fontSize: 13, color: colors.mutedInk },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  headerButton: {
    minHeight: layout.minTarget,
    minWidth: layout.minTarget,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  headerButtonPhone: { paddingHorizontal: spacing.md },
  headerButtonLabel: { ...type.label, fontSize: 13, color: colors.ink },
  rule: {
    height: 1,
    marginTop: spacing.lg,
    backgroundColor: colors.border,
  },
  content: { gap: spacing.xl, paddingTop: spacing.xl, flexGrow: 1 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  footerText: { ...type.small, fontSize: 13, color: colors.mutedInk },
  footerLink: {
    minHeight: layout.minTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  footerLinkLabel: { ...type.small, fontSize: 13, color: colors.mutedInk },
});
