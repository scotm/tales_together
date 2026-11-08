import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRotatingPhrase } from "@/lib/loadingPhrases";
import { storyStyles } from "./storyStyles";
export function Working({
  phrases,
  timeoutMs,
}: {
  phrases: readonly string[];
  timeoutMs?: number;
}) {
  const phrase = useRotatingPhrase(phrases);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!timeoutMs) return;
    const timer = setTimeout(() => setExpired(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);
  if (expired) return null;
  return (
    <View accessibilityLiveRegion="polite" style={storyStyles.actions}>
      <ActivityIndicator />
      <Text style={storyStyles.muted}>{phrase}…</Text>
    </View>
  );
}
