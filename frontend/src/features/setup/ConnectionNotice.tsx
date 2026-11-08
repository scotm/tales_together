import { useConvex } from "convex/react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { useReconnectBackend } from "@/lib/BackendProvider";
import type { RecentStories } from "./useRecentStories";

/**
 * Shown once a connection or query has stalled. Reconnecting is withheld
 * while writes are queued: closing the client would discard them.
 */
export function ConnectionNotice({ recent }: { recent: RecentStories }) {
  const client = useConvex();
  const reconnect = useReconnectBackend();
  const router = useRouter();
  if (!recent.stalled) return null;
  const { connection } = recent;
  const pending = connection.inflightMutations || connection.inflightActions;
  return (
    <View accessibilityRole="alert" style={styles.card}>
      <Text style={styles.title}>
        {connection.isWebSocketConnected
          ? "The story server is taking too long to respond."
          : "Cannot connect to the story server. Check your connection and keep the server running."}
      </Text>
      <Text selectable style={styles.muted}>
        Server: {client.url}
      </Text>
      <Text style={styles.muted}>
        We’ll reconnect automatically. Your choices are kept.
      </Text>
      {pending ? (
        <Text style={styles.muted}>
          Waiting for your pending request. Keep this page open.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {pending ? null : (
          <WorkshopButton
            label="Try connecting again"
            variant="secondary"
            onPress={reconnect}
          />
        )}
        <WorkshopButton
          label="Help & diagnostics"
          variant="secondary"
          onPress={() => router.push("/diagnostics")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.apricot,
    backgroundColor: colors.surface,
  },
  title: { ...type.bodyStrong, color: colors.danger },
  muted: { ...type.small, color: colors.mutedInk },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
