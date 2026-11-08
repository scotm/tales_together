import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { fontFaces } from "@/components/workshop/theme";
import { SetupProvider } from "@/features/setup/SetupProvider";
import { BackendProvider } from "@/lib/BackendProvider";
import { ConnectionMonitor } from "@/lib/diagnostics/ConnectionMonitor";
import {
  DiagnosticsProvider,
  useDiagnostics,
} from "@/lib/diagnostics/DiagnosticsProvider";
import { DiagnosticsErrorBoundary } from "@/lib/diagnostics/ErrorBoundary";

/** Never hold the app behind fonts: fall back to system faces after this. */
const FONT_WAIT_MS = 2_500;

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

function useWorkshopFonts() {
  const [loaded, error] = useFonts({
    [fontFaces.regular]: require("../../assets/fonts/Poppins-Regular.ttf"),
    [fontFaces.medium]: require("../../assets/fonts/Poppins-Medium.ttf"),
    [fontFaces.semiBold]: require("../../assets/fonts/Poppins-SemiBold.ttf"),
    [fontFaces.bold]: require("../../assets/fonts/Poppins-Bold.ttf"),
    [fontFaces.serif]: require("../../assets/fonts/SourceSerif4-Regular.ttf"),
    [fontFaces.serifSemiBold]: require("../../assets/fonts/SourceSerif4-Semibold.ttf"),
  });
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return { ready: loaded || Boolean(error) || gaveUp, error };
}

export default function RootLayout() {
  const fonts = useWorkshopFonts();
  return (
    <DiagnosticsProvider>
      <FontReport error={fonts.error} />
      {/* Keep the draft outside the backend subtree so reconnects and
          trips to Diagnostics cannot erase it. */}
      <SetupProvider>
        <BackendProvider>{fonts.ready ? <AppShell /> : null}</BackendProvider>
      </SetupProvider>
    </DiagnosticsProvider>
  );
}

function FontReport({ error }: { error: Error | null }) {
  const diagnostics = useDiagnostics();
  const reported = useRef(false);
  useEffect(() => {
    if (!error || reported.current) return;
    reported.current = true;
    diagnostics.record("app.fonts_failed", {
      level: "warn",
      status: "failed",
      stage: "fonts",
      message: "Workshop fonts failed to load; using system fonts.",
    });
  }, [error, diagnostics]);
  return null;
}
