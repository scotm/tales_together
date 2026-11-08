import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ChoiceView } from "@/features/setup/catalog";
import { workshopAssets } from "@/lib/workshopAssets";
import { CatalogArt } from "./CatalogArt";

/** All layers share the SVG's 300-square origin; quirks have their own badge. */
export function HeroPreview({
  character,
  outfit,
  quirk,
  size = 220,
}: {
  character?: ChoiceView;
  outfit?: ChoiceView;
  quirk?: ChoiceView;
  size?: number;
}) {
  const badge = Math.round(62 * (size / 220));
  const [failedBase, setFailedBase] = useState<string | null>(null);
  const [failedOutfit, setFailedOutfit] = useState<string | null>(null);
  const signature = (option?: ChoiceView) =>
    `${option?.optionId}:${option?.previewUrl}:${option?.assetKey}`;
  const hasLayer = (option?: ChoiceView) =>
    option?.previewLayout === "layer" &&
    Boolean(
      option.previewUrl || (option.assetKey && workshopAssets[option.assetKey]),
    );
  const layered = hasLayer(character) && failedBase !== signature(character);
  const overlay =
    layered && hasLayer(outfit) && failedOutfit !== signature(outfit);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size }]}
    >
      <CatalogArt
        option={character}
        size={size}
        onUnavailable={() => setFailedBase(signature(character))}
      />
      {outfit && overlay ? (
        <View style={StyleSheet.absoluteFill}>
          <CatalogArt
            option={outfit}
            size={size}
            onUnavailable={() => setFailedOutfit(signature(outfit))}
          />
        </View>
      ) : null}
      {outfit && !overlay ? (
        <View style={styles.outfit}>
          <CatalogArt option={outfit} size={badge} />
        </View>
      ) : null}
      {quirk ? (
        <View style={styles.quirk}>
          <CatalogArt option={quirk} size={badge} />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { alignSelf: "center" },
  quirk: { position: "absolute", right: 0, bottom: 0 },
  outfit: { position: "absolute", left: 0, bottom: 0 },
});
