// biome-ignore-all lint/correctness/noReactNativeRawText: This web-only module renders DOM elements.
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { CatalogArt } from "./CatalogArt";
import type { ChoiceShelfProps } from "./ChoiceShelf.types";
import { colors, fontFaces } from "./theme";

export function ChoiceShelf({
  label,
  options,
  selectedId,
  columns,
  onSelect,
  offsets,
  category,
}: ChoiceShelfProps) {
  const { height, width } = useWindowDimensions();
  const container = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [limit, setLimit] = useState<number | undefined>();
  const [focused, setFocused] = useState<string | null>(null);
  const selectedIndex = options.findIndex(
    (option) => option.optionId === selectedId,
  );
  const tabIndex = Math.max(0, selectedIndex);
  useEffect(() => {
    const node = container.current;
    if (!node || width <= 0) return;
    const available = height - node.getBoundingClientRect().top - 140;
    setLimit(height >= 780 && available >= 280 ? available : undefined);
  }, [height, width]);
  useEffect(() => {
    if (container.current) container.current.scrollTop = offsets[category] ?? 0;
  }, [category, offsets]);
  useEffect(() => {
    const button = buttons.current.get(selectedId);
    const node = container.current;
    if (!button || !node || !limit) return;
    const top =
      button.getBoundingClientRect().top -
      node.getBoundingClientRect().top +
      node.scrollTop;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + button.offsetHeight > node.scrollTop + node.clientHeight)
      node.scrollTop = top + button.offsetHeight - node.clientHeight;
  }, [selectedId, limit]);
  return (
    <div>
      {limit ? (
        <p
          style={{
            color: colors.mutedInk,
            fontFamily: fontFaces.regular,
            fontSize: 14,
          }}
        >
          Scroll for more ideas
        </p>
      ) : null}
      <div
        ref={container}
        role="radiogroup"
        aria-label={label}
        onScroll={(event) => {
          offsets[category] = event.currentTarget.scrollTop;
        }}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 8,
          maxHeight: limit,
          overflowY: limit ? "auto" : "visible",
          padding: 4,
          position: "relative",
        }}
      >
        {options.map((option, index) => {
          const selected = option.optionId === selectedId;
          return (
            // biome-ignore lint/a11y/useSemanticElements: Roving radio tiles implement grid arrow navigation.
            <button
              key={option.optionId}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              tabIndex={index === tabIndex ? 0 : -1}
              ref={(node) => {
                if (node) buttons.current.set(option.optionId, node);
                else buttons.current.delete(option.optionId);
              }}
              onFocus={() => setFocused(option.optionId)}
              onBlur={() => setFocused(null)}
              onClick={() => onSelect(option)}
              onKeyDown={(event) => {
                let next = index;
                switch (event.key) {
                  case "ArrowRight":
                    next = Math.min(options.length - 1, index + 1);
                    break;
                  case "ArrowLeft":
                    next = Math.max(0, index - 1);
                    break;
                  case "ArrowDown":
                    next = Math.min(options.length - 1, index + columns);
                    break;
                  case "ArrowUp":
                    next = Math.max(0, index - columns);
                    break;
                  case "Home":
                    next = 0;
                    break;
                  case "End":
                    next = options.length - 1;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                const option = options[next];
                if (option) {
                  onSelect(option);
                  buttons.current.get(option.optionId)?.focus();
                }
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: "pointer",
                minHeight: 150,
                minWidth: 0,
                padding: 12,
                borderRadius: 18,
                border: `2px solid ${selected ? colors.ink : colors.border}`,
                background: colors.surface,
                color: colors.ink,
                fontFamily: fontFaces.medium,
                fontSize: 15,
                outline:
                  focused === option.optionId
                    ? `3px solid ${colors.violet}`
                    : undefined,
                outlineOffset: 1,
              }}
            >
              <CatalogArt option={option} size={96} />
              <span>{option.displayLabel}</span>
              {selected ? (
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", top: 8, right: 8 }}
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
