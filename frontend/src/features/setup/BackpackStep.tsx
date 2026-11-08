import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CatalogArt } from "@/components/workshop/CatalogArt";
import { ChoiceTile } from "@/components/workshop/ChoiceTile";
import { colors, radii, spacing, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import {
  available,
  type ChoiceView,
  catalogChoice,
  labelFor,
  type WorkshopCatalog,
} from "./catalog";
import type { SetupStep } from "./draft";
import { HeroSummary } from "./HeroStep";
import {
  ChoiceGrid,
  Field,
  StepHeading,
  StepProgress,
  setupStyles,
  useShelfColumns,
} from "./parts";
import { useSetupDraft } from "./SetupProvider";

/**
 * Backpack (proposed layout; no revised frame exists): item tiles, three
 * slots, the optional author credit and a summary before starting.
 */
export function BackpackStep({
  catalog,
  canStart,
  creating,
  startBlockedReason,
  error,
  onBack,
  onStart,
  onStep,
}: {
  catalog: WorkshopCatalog;
  canStart: boolean;
  creating: boolean;
  startBlockedReason: string | null;
  error: string | null;
  onBack: () => void;
  onStart: () => void;
  onStep: (step: SetupStep) => void;
}) {
  const { draft, dispatch } = useSetupDraft();
  const columns = useShelfColumns(3, 2);
  const [fullNotice, setFullNotice] = useState(false);
  const capacity = catalog.backpackSize;
  const full = draft.packed.length >= capacity;

  function toggle(option: ChoiceView) {
    const packed = draft.packed.some((choice) => choice.key === option.key);
    setFullNotice(!packed && full);
    dispatch({ type: "toggleItem", choice: catalogChoice(option), capacity });
  }

  return (
    <View style={styles.step}>
      <StepProgress current={draft.step} onSelect={onStep} variant="crumb" />
      <StepHeading
        eyebrow=""
        title="Pack their bag"
        lede={`Choose ${capacity} useful things. They might save the day.`}
      />

      <View style={styles.slots}>
        <Text style={setupStyles.sectionTitle}>
          {draft.packed.length}/{capacity} packed
        </Text>
        <View style={styles.slotRow}>
          {Array.from({ length: capacity }, (_, index) => {
            const key = draft.packed[index];
            return (
              <Pressable
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
                key={index}
                accessibilityRole="button"
                accessibilityLabel={
                  key
                    ? `Remove ${labelFor(catalog.items, key)}`
                    : "Empty pocket"
                }
                disabled={!key}
                onPress={() => {
                  if (key) {
                    dispatch({ type: "toggleItem", choice: key, capacity });
                    setFullNotice(false);
                  }
                }}
                style={[styles.slot, key ? styles.slotFilled : null]}
              >
                <Text style={styles.slotLabel}>
                  {key ? labelFor(catalog.items, key) : "Empty pocket"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fullNotice ? (
          <Text accessibilityLiveRegion="polite" style={setupStyles.muted}>
            The bag is full. Take something out first.
          </Text>
        ) : null}
      </View>

      <ChoiceGrid columns={columns} label="Things to pack" multiSelect>
        {available(catalog.items).map((item) => (
          <ChoiceTile
            key={item.optionId}
            art={<CatalogArt option={item} />}
            role="checkbox"
            label={item.label}
            selected={draft.packed.some(
              (choice) => choice.optionId === item.optionId,
            )}
            onPress={() => toggle(item)}
          />
        ))}
      </ChoiceGrid>

      <View style={styles.author}>
        <Field
          label="Written by (optional)"
          placeholder="Written by (optional)"
          value={draft.authorName}
          onChangeText={(value) => dispatch({ type: "setAuthorName", value })}
          autoCapitalize="words"
          maxLength={60}
          hint="This goes on the cover. It can be different from the hero."
        />
      </View>

      <View style={styles.summary}>
        <Text style={setupStyles.sectionTitle}>Your story so far</Text>
        <Text style={styles.summaryLine}>
          {labelFor(catalog.settings, draft.setting)} ·{" "}
          {labelFor(catalog.problems, draft.problem)}
        </Text>
        <View style={styles.summaryHero}>
          <HeroSummary catalog={catalog} />
        </View>
      </View>

      <View style={setupStyles.actions}>
        <WorkshopButton label="← Back" variant="secondary" onPress={onBack} />
        <WorkshopButton
          label="Start the story"
          busy={creating}
          busyLabel="Starting…"
          disabled={!canStart}
          accessibilityHint={startBlockedReason ?? undefined}
          onPress={onStart}
        />
      </View>
      {startBlockedReason && !creating ? (
        <Text style={setupStyles.muted}>{startBlockedReason}</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={setupStyles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.xl },
  slots: { gap: spacing.sm },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  slot: {
    flexGrow: 1,
    flexBasis: 160,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  slotFilled: {
    borderStyle: "solid",
    borderColor: colors.mint,
    backgroundColor: colors.mint,
  },
  slotLabel: { ...type.bodyStrong, color: colors.ink },
  author: { maxWidth: 520 },
  summary: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 620,
  },
  summaryLine: { ...type.body, color: colors.ink },
  summaryHero: { maxWidth: 528, width: "100%" },
});
