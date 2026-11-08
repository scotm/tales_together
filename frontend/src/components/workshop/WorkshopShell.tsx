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

/**
 * Brand header, safe areas, content width and the Help control shared by
 * every workshop screen. `headerActions` sits beside Help (e.g. Recent
 * stories). Content scrolls as a whole so large text never clips.
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
  const gutter =
    width < layout.phoneMaxWidth ? spacing.phoneGutter : spacing.desktopGutter;
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter }]}
        >
          <View style={[styles.frame, { maxWidth }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.brand}>
                Tales Together
              </Text>
              <View style={styles.actions}>
                {headerActions}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Help & diagnostics"
                  onPress={() => router.push("/diagnostics")}
                  style={styles.headerButton}
                >
                  <Text style={styles.headerButtonLabel}>Help</Text>
                </Pressable>
              </View>
            </View>
            {children}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.headerButton}
    >
      <Text style={styles.headerButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1, paddingVertical: spacing.xl },
  frame: { width: "100%", alignSelf: "center", gap: spacing.xl },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  brand: { ...type.title, color: colors.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  headerButton: {
    minHeight: layout.minTarget,
    minWidth: layout.minTarget,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerButtonLabel: { ...type.label, color: colors.ink },
});
