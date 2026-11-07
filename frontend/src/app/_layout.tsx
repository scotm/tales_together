import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BackendProvider } from "@/lib/BackendProvider";
import { ConnectionMonitor } from "@/lib/diagnostics/ConnectionMonitor";
import {
  DiagnosticsProvider,
  useDiagnostics,
} from "@/lib/diagnostics/DiagnosticsProvider";
import { DiagnosticsErrorBoundary } from "@/lib/diagnostics/ErrorBoundary";

function AppShell() {
  const diagnostics = useDiagnostics();
  return (
    <>
      <ConnectionMonitor />
      <DiagnosticsErrorBoundary diagnostics={diagnostics}>
        <Stack screenOptions={{ headerShown: false }} />
      </DiagnosticsErrorBoundary>
      <StatusBar style="dark" />
    </>
  );
}

export default function RootLayout() {
  return (
    <DiagnosticsProvider>
      <BackendProvider>
        <AppShell />
      </BackendProvider>
    </DiagnosticsProvider>
  );
}
