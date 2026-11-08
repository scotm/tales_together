import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CatalogArt } from "@/components/workshop/CatalogArt";
import { ChoiceTile } from "@/components/workshop/ChoiceTile";
import {
  colors,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import {
  available,
  catalogChoice,
  choiceFor,
  labelFor,
  type WorkshopCatalog,
} from "./catalog";
import type { WorldPart } from "./draft";
import { ChoiceGrid, StepHeading, setupStyles, useShelfColumns } from "./parts";
import { useSetupDraft } from "./SetupProvider";

const PARTS: { part: WorldPart; eyebrow: string; keepLabel: string }[] = [
  { part: "setting", eyebrow: "Where are we?", keepLabel: "Keep this place" },
  {
    part: "problem",
    eyebrow: "What went wrong?",
    keepLabel: "Keep this trouble",
  },
];

/**
 * World: the current setting and problem, each with a Keep switch for
 * Surprise and a body that opens direct selection (the mockup only shows
 * Keep; direct choice is preserved from the original app).
 */
export function WorldStep({
  catalog,
  onNext,
}: {
  catalog: WorkshopCatalog;
  onNext: () => void;
}) {
  const { draft, dispatch } = useSetupDraft();
  const [open, setOpen] = useState<WorldPart | null>(null);
  const columns = useShelfColumns(2, 1);
  const bothKept = draft.keepSetting && draft.keepProblem;
  const options = { setting: catalog.settings, problem: catalog.problems };

  return (
    <View style={styles.step}>
      <StepHeading
        eyebrow="Step 1 · World"
        title="Build a world"
        lede="Choose where the story happens and what goes wrong, or let Surprise pick for you."
      />
      <View style={styles.preview}>
        <CatalogArt
          option={choiceFor(catalog.settings, draft.setting)}
          size={180}
        />
        <Text style={styles.previewText}>
          {labelFor(catalog.settings, draft.setting)}
        </Text>
        <Text style={styles.previewProblem}>
          {labelFor(catalog.problems, draft.problem)}
        </Text>
      </View>

      {PARTS.map(({ part, eyebrow, keepLabel }) => {
        const kept = part === "setting" ? draft.keepSetting : draft.keepProblem;
        const current = draft[part];
        const isOpen = open === part;
        return (
          <View key={part} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                part === "setting" ? "Change the place" : "Change the trouble"
              }
              accessibilityState={{ expanded: isOpen }}
              accessibilityHint="Shows every choice"
              onPress={() => setOpen(isOpen ? null : part)}
              style={styles.cardBody}
            >
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.choice}>
                {labelFor(options[part], current)}
              </Text>
              <Text style={setupStyles.muted}>
                {isOpen ? "Hide choices" : "Change"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={keepLabel}
              accessibilityState={{ checked: kept }}
              onPress={() => dispatch({ type: "toggleKeep", part })}
              style={[styles.keep, kept && styles.keepOn]}
            >
              <Text style={styles.keepLabel}>
                {kept ? `✓ ${keepLabel}` : keepLabel}
              </Text>
            </Pressable>
            {isOpen ? (
              <ChoiceGrid columns={columns} label={eyebrow}>
                {available(options[part]).map((option) => (
                  <ChoiceTile
                    art={<CatalogArt option={option} />}
                    key={option.optionId}
                    label={option.label}
                    selected={option.optionId === current.optionId}
                    onPress={() => {
                      dispatch({
                        type: "selectWorld",
                        part,
                        choice: catalogChoice(option),
                      });
                      setOpen(null);
                    }}
                  />
                ))}
              </ChoiceGrid>
            ) : null}
          </View>
        );
      })}

      <View style={setupStyles.actions}>
        <View style={styles.surprise}>
          <WorkshopButton
            label="🎲 Surprise me"
            variant="shuffle"
            disabled={bothKept}
            onPress={() =>
              dispatch({
                type: "surprise",
                options: {
                  settings: available(catalog.settings).map(catalogChoice),
                  problems: available(catalog.problems).map(catalogChoice),
                },
              })
            }
          />
          {bothKept ? (
            <Text style={setupStyles.muted}>
              You’re keeping both. Turn one off to be surprised.
            </Text>
          ) : null}
        </View>
        <WorkshopButton label="Make your hero →" onPress={onNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.xl },
  preview: {
    padding: spacing.xl,
    borderRadius: radii.panel,
    backgroundColor: colors.ink,
    gap: spacing.sm,
  },
  previewText: { ...type.storyTitle, color: colors.surface },
  previewProblem: { ...type.bodyStrong, color: colors.gold },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardBody: { gap: spacing.xs, minHeight: layout.minTarget },
  eyebrow: { ...type.eyebrow, color: colors.violet },
  choice: { ...type.cardTitle, color: colors.ink },
  keep: {
    alignSelf: "flex-start",
    minHeight: layout.minTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
  },
  keepOn: { backgroundColor: colors.mint, borderColor: colors.mint },
  keepLabel: { ...type.label, color: colors.ink },
  surprise: { gap: spacing.xs, flexShrink: 1 },
});
