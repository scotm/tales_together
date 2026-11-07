import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { BackendProvider } from "@/lib/BackendProvider";

export default function RootLayout() {
  return (
    <BackendProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </BackendProvider>
  );
}
