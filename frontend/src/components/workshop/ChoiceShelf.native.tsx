import { useCallback, useEffect, useRef } from "react";
import {
  ScrollView,
  type ScrollViewInstance,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { setupStyles } from "@/features/setup/parts";
import { CatalogArt } from "./CatalogArt";
import type { ChoiceShelfProps } from "./ChoiceShelf.types";
import { ChoiceTile } from "./ChoiceTile";

export function ChoiceShelf({
  label,
  options,
  selectedId,
  columns,
  onSelect,
  offsets,
  category,
}: ChoiceShelfProps) {
  const { height, fontScale } = useWindowDimensions();
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, { y: number; height: number }>());
  const bounded = height >= 850 && fontScale <= 1.2;
  useEffect(() => {
    if (bounded)
      scroll.current?.scrollTo({ y: offsets[category] ?? 0, animated: false });
  }, [category, offsets, bounded]);
  const viewportHeight = useRef(0);
  const revealSelected = useCallback(() => {
    const position = positions.current.get(selectedId);
    const offset = offsets[category] ?? 0;
    if (!bounded || !position || !viewportHeight.current) return;
    if (position.y < offset)
      scroll.current?.scrollTo({ y: position.y, animated: false });
    else if (position.y + position.height > offset + viewportHeight.current) {
      scroll.current?.scrollTo({
        y: position.y + position.height - viewportHeight.current,
        animated: false,
      });
    }
  }, [selectedId, bounded, offsets, category]);
  useEffect(revealSelected, [revealSelected]);
  return (
    <View>
      {bounded ? (
        <Text style={setupStyles.muted}>Scroll for more ideas</Text>
      ) : null}
      <ScrollView
        ref={scroll}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height;
          revealSelected();
        }}
        nestedScrollEnabled
        scrollEnabled={bounded}
        style={bounded ? { maxHeight: Math.min(560, height - 420) } : undefined}
        onScroll={(event) => {
          offsets[category] = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={100}
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={{ flexDirection: "row", flexWrap: "wrap" }}
        >
          {options.map((option) => (
            <View
              key={option.optionId}
              style={{ width: `${100 / columns}%`, padding: 4 }}
              onLayout={(event) => {
                const y = event.nativeEvent.layout.y;
                positions.current.set(option.optionId, {
                  y,
                  height: event.nativeEvent.layout.height,
                });
                if (option.optionId === selectedId) revealSelected();
              }}
            >
              <ChoiceTile
                label={option.label}
                selected={option.optionId === selectedId}
                art={<CatalogArt option={option} size={96} />}
                artSize={96}
                style={{
                  flexDirection: "column",
                  minHeight: 160,
                  paddingRight: 12,
                }}
                onPress={() => onSelect(option)}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
