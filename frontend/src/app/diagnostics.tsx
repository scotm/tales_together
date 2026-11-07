import { useConvex, useConvexConnectionState } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { checkConnection } from "@/lib/diagnostics/checks";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { copyText, saveDiagnostics } from "@/lib/diagnostics/export";

export default function DiagnosticsScreen() {
  const router = useRouter();
  const client = useConvex();
  const connection = useConvexConnectionState();
  const diagnostics = useDiagnostics();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const events = diagnostics.events();
  const recent = [...events].slice(-10).reverse();

  async function runCheck() {
    setBusy(true);
    setMessage(null);
    try {
      const results = await checkConnection(client, diagnostics);
      setMessage(
        results.every((check) => check.status === "succeeded")
          ? "Both checks succeeded."
          : "One check failed. The details below are safe to share.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copySummary() {
    try {
      await copyText(diagnostics.summary());
      setMessage("Summary copied.");
    } catch {
      setMessage("Copy is unavailable. Use Save diagnostics instead.");
    }
  }

  async function saveBundle() {
    try {
      await saveDiagnostics(
        JSON.stringify(diagnostics.bundle(), null, 2),
        `tales-diagnostics-${Date.now()}.json`,
      );
      setMessage("Diagnostics file prepared.");
    } catch {
      setMessage("The diagnostics file could not be saved.");
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.link}
        >
          <Text style={styles.linkLabel}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Help &amp; diagnostics</Text>
        <Text style={styles.body}>
          A plain summary of this device and its connection. Nothing is uploaded
          automatically.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {connection.isWebSocketConnected ? "Connected" : "Not connected"}
          </Text>
          <Text selectable style={styles.muted}>
            Server: {client.url}
          </Text>
          <Text style={styles.muted}>
            Configured: {diagnostics.connection.configuredOrigin ?? "same"}
          </Text>
          <Text style={styles.muted}>
            Loopback correction:{" "}
            {diagnostics.connection.loopbackCorrected ? "applied" : "no"}
          </Text>
          <Text style={styles.muted}>
            Build: {diagnostics.identity.appVersion} (
            {diagnostics.identity.buildId})
          </Text>
          <Text style={styles.muted}>
            {diagnostics.identity.platform} · {diagnostics.identity.osVersion} ·{" "}
            {diagnostics.identity.runtime}
          </Text>
          <Text style={styles.muted}>
            Last connected:{" "}
            {diagnostics.connection.lastConnectedAt
              ? new Date(
                  diagnostics.connection.lastConnectedAt,
                ).toLocaleTimeString()
              : "not this launch"}
          </Text>
          <Text style={styles.muted}>
            Pending: {connection.inflightMutations} writes ·{" "}
            {connection.inflightActions} actions
          </Text>
          <Text style={styles.muted}>
            Reconnects: {diagnostics.connection.reconnectCount} · retries:{" "}
            {diagnostics.connection.connectionRetries}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={runCheck}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {busy ? "Checking…" : "Check connection"}
          </Text>
        </Pressable>
        <Text style={styles.muted}>
          The check asks the version endpoint and performs one read-only story
          query. It never calls a paid provider.
        </Text>

        {diagnostics.checks.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Checks</Text>
            {diagnostics.checks.map((check) => (
              <Text
                key={`${check.name}-${check.durationMs}`}
                style={styles.muted}
              >
                {check.name}: {check.status}
                {check.detail ? ` · ${check.detail}` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent events</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>Nothing recorded yet.</Text>
          ) : (
            recent.map((event) => (
              <Text key={event.eventId} style={styles.event}>
                {new Date(event.timestamp).toLocaleTimeString()} {event.name}
                {event.errorCode ? ` · ${event.errorCode}` : ""}
              </Text>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preview</Text>
          <Text selectable style={styles.preview}>
            {diagnostics.summary()}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={copySummary}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Copy summary</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={saveBundle}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Save or share diagnostics</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            diagnostics.clear();
            setMessage("Local diagnostics cleared.");
          }}
          style={styles.secondary}
        >
          <Text style={styles.secondaryLabel}>Clear local diagnostics</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Text style={styles.footer}>
          Story links, chapter text, names, prompts and server secrets are never
          included. The exported file redacts private server addresses.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDF6E3" },
  content: {
    padding: 24,
    gap: 12,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  link: { alignSelf: "flex-start", paddingVertical: 4 },
  linkLabel: { fontSize: 15, color: "#92400E" },
  title: { fontSize: 28, fontWeight: "800", color: "#1F1A17" },
  body: { fontSize: 16, lineHeight: 24, color: "#57534E" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E7E5E4",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#1F1A17" },
  muted: { color: "#78716C" },
  event: { fontSize: 13, color: "#44403C" },
  preview: { fontSize: 12, lineHeight: 18, color: "#44403C" },
  button: {
    backgroundColor: "#F59E0B",
    borderBottomWidth: 6,
    borderBottomColor: "#B45309",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
  buttonLabel: { fontSize: 17, fontWeight: "700", color: "#1F1A17" },
  secondary: { alignSelf: "flex-start", paddingVertical: 6 },
  secondaryLabel: { fontSize: 15, color: "#92400E" },
  message: { color: "#166534" },
  footer: { fontSize: 13, lineHeight: 19, color: "#78716C" },
});
