import { ConvexProvider } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { convex } from "@/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </ConvexProvider>
  );
}
