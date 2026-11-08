import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { ChoiceView } from "@/features/setup/catalog";
import { workshopAssets } from "@/lib/workshopAssets";
import { colors } from "./theme";

/** Remote previews take priority; failed/unknown art has an honest neutral fallback. */
export function CatalogArt({
  option,
  size = 64,
  onUnavailable,
}: {
  option?: ChoiceView;
  size?: number;
  onUnavailable?(): void;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const remoteKey = option?.previewUrl ?? "";
  const bundleKey = `bundle:${option?.assetKey ?? ""}`;
  const sourceKey =
    remoteKey && !failed.includes(remoteKey) ? remoteKey : bundleKey;
  const source =
    option?.previewUrl && !failed.includes(option.previewUrl)
      ? { uri: option.previewUrl }
      : option?.assetKey && !failed.includes(bundleKey)
        ? workshopAssets[option.assetKey]
        : undefined;
  return source ? (
    <Image
      testID="catalog-art"
      accessible={false}
      source={source}
      resizeMode="contain"
      style={{ width: size, height: size }}
      onError={() => {
        setFailed((keys) => [...keys, sourceKey]);
        if (
          sourceKey === bundleKey ||
          !option?.assetKey ||
          !workshopAssets[option.assetKey] ||
          failed.includes(bundleKey)
        )
          onUnavailable?.();
      }}
    />
  ) : (
    <View
      accessible={false}
      style={[styles.fallback, { width: size, height: size }]}
    >
      <Text style={styles.mark}>✦</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.mint,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  mark: { color: colors.ink, fontSize: 28 },
});
