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
}: {
  character?: ChoiceView;
  outfit?: ChoiceView;
  quirk?: ChoiceView;
}) {
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
      style={styles.frame}
    >
      <CatalogArt
        option={character}
        size={220}
        onUnavailable={() => setFailedBase(signature(character))}
      />
      {outfit && overlay ? (
        <View style={StyleSheet.absoluteFill}>
          <CatalogArt
            option={outfit}
            size={220}
            onUnavailable={() => setFailedOutfit(signature(outfit))}
          />
        </View>
      ) : null}
      {outfit && !overlay ? (
        <View style={styles.outfit}>
          <CatalogArt option={outfit} size={62} />
        </View>
      ) : null}
      {quirk ? (
        <View style={styles.quirk}>
          <CatalogArt option={quirk} size={62} />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { width: 220, height: 220, alignSelf: "center" },
  quirk: { position: "absolute", right: 0, bottom: 0 },
  outfit: { position: "absolute", left: 0, bottom: 0 },
});
