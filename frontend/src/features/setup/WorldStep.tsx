import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CatalogArt } from "@/components/workshop/CatalogArt";
import { ChoiceTile } from "@/components/workshop/ChoiceTile";
import {
  colors,
  fontFaces,
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
import type { SetupStep, WorldPart } from "./draft";
import {
  ChoiceGrid,
  StepHeading,
  StepProgress,
  useShelfColumns,
} from "./parts";
import { useSetupDraft } from "./SetupProvider";

const PARTS: {
  part: WorldPart;
  eyebrow: string;
  keepLabel: string;
  tab: string;
}[] = [
  {
    part: "setting",
    eyebrow: "Where are we?",
    keepLabel: "Keep this place",
    tab: colors.mint,
  },
  {
    part: "problem",
    eyebrow: "What went wrong?",
    keepLabel: "Keep this trouble",
    tab: colors.apricot,
  },
];

/**
 * World: the current setting and problem as two paper reels beside a live
 * story postcard. Keep leaves a reel alone when Surprise spins the other.
 */
export function WorldStep({
  catalog,
  onNext,
  onStep,
}: {
  catalog: WorkshopCatalog;
  onNext: () => void;
  onStep: (step: SetupStep) => void;
}) {
  const { draft, dispatch } = useSetupDraft();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<WorldPart | null>(null);
  const wide = width >= layout.splitMinWidth;
  const columns = useShelfColumns(2, 1);
  const bothKept = draft.keepSetting && draft.keepProblem;
  const options = { setting: catalog.settings, problem: catalog.problems };
  const postcard = (
    <StoryPostcard
      setting={labelFor(catalog.settings, draft.setting)}
      problem={labelFor(catalog.problems, draft.problem)}
      art={choiceFor(catalog.settings, draft.setting)}
    />
  );

  return (
    <View style={[styles.step, wide && styles.stepWide]}>
      <View style={styles.mainColumn}>
        <StepHeading
          display
          eyebrow="Step 1 · World"
          title="Build a world"
          lede="Choose where the story happens and what goes wrong, or let Surprise pick for you."
        />
        <StepProgress current={draft.step} onSelect={onStep} />
        {wide ? null : postcard}

        {PARTS.map(({ part, eyebrow, keepLabel, tab }, index) => {
          const kept =
            part === "setting" ? draft.keepSetting : draft.keepProblem;
          const current = draft[part];
          const isOpen = open === part;
          return (
            <View key={part} style={styles.reel}>
              <View style={[styles.tab, { backgroundColor: tab }]} />
              <View style={styles.reelBody}>
                <View style={styles.reelRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      part === "setting"
                        ? "Change the place"
                        : "Change the trouble"
                    }
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityHint="Shows every choice"
                    onPress={() => setOpen(isOpen ? null : part)}
                    style={styles.reelMain}
                  >
                    <View style={styles.reelLabelRow}>
                      <Text style={styles.reelNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                      <Text style={styles.reelLabel}>{eyebrow}</Text>
                    </View>
                    <Text style={styles.reelChoice}>
                      {labelFor(options[part], current)}
                    </Text>
                    <Text style={styles.reelHint}>
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
                      {kept ? "Keep ✓" : "Keep?"}
                    </Text>
                  </Pressable>
                </View>
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
            </View>
          );
        })}

        <View style={[styles.actions, wide && styles.actionsWide]}>
          <WorkshopButton
            label="Surprise me ↻"
            variant="shuffle"
            style={wide ? styles.surpriseButton : undefined}
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
          <WorkshopButton
            label="Make your hero →"
            style={wide ? styles.nextButton : undefined}
            onPress={onNext}
          />
        </View>
        <Text style={styles.hint}>
          {bothKept
            ? "You’re keeping both. Turn one off to be surprised."
            : "“Keep” saves a choice when you spin again."}
        </Text>
      </View>
      {wide ? <View style={styles.previewColumn}>{postcard}</View> : null}
    </View>
  );
}

/** The dark live postcard: illustrated theatre, label and the world so far. */
function StoryPostcard({
  setting,
  problem,
  art,
}: {
  setting: string;
  problem: string;
  art?: ReturnType<typeof choiceFor>;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.postcard}>
      <Text style={styles.kicker}>ONCE UPON A WHAT-IF…</Text>
      <View
        style={[
          styles.theatre,
          width < layout.splitMinWidth && styles.theatreNarrow,
        ]}
      >
        <View style={styles.pool} />
        <Text style={[styles.bubble, styles.bubbleOne]} />
        <Text style={[styles.bubble, styles.bubbleTwo]} />
        <Text style={[styles.bubble, styles.bubbleThree]} />
        <Text style={[styles.spark, styles.sparkOne]}>✦</Text>
        <Text style={[styles.spark, styles.sparkTwo]}>✦</Text>
        <CatalogArt
          option={art}
          size={
            width < layout.phoneMaxWidth
              ? 200
              : width < layout.splitMinWidth
                ? 270
                : 330
          }
        />
      </View>
      <View style={styles.postcardPill}>
        <Text style={styles.postcardPillLabel}>YOUR WORLD SO FAR</Text>
      </View>
      <View style={styles.postcardLines}>
        <Text style={styles.postcardTitle}>{setting}</Text>
        <Text style={styles.postcardTitle}>{problem}</Text>
      </View>
      <Text style={styles.postcardSupport}>
        Something wonderfully strange is about to happen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.xl },
  stepWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xxl + 16,
  },
  mainColumn: { flex: 1, gap: spacing.xl, minWidth: 0 },
  previewColumn: { flexBasis: 586, flexGrow: 0, flexShrink: 0 },
  reel: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { width: 9 },
  reelBody: { flex: 1, padding: spacing.xl, paddingLeft: spacing.xxl - 8 },
  reelRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reelMain: { flex: 1, gap: spacing.xs },
  reelLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  reelNumber: {
    fontFamily: fontFaces.medium,
    fontSize: 26,
    lineHeight: 34,
    color: colors.mutedInk,
  },
  reelLabel: { ...type.eyebrow, color: colors.mutedInk },
  reelChoice: { ...type.reel, color: colors.ink },
  reelHint: { ...type.small, color: colors.mutedInk },
  keep: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
  },
  keepOn: { backgroundColor: colors.mint },
  keepLabel: { ...type.label, fontSize: 13, color: colors.ink },
  actions: { gap: spacing.md },
  actionsWide: { flexDirection: "row", gap: spacing.lg },
  surpriseButton: { flexBasis: 274, flexGrow: 0 },
  nextButton: { flex: 1 },
  hint: { ...type.small, color: colors.mutedInk },
  postcard: {
    gap: spacing.lg,
    padding: spacing.xxl - 2,
    borderRadius: radii.postcard,
    backgroundColor: colors.ink,
    overflow: "hidden",
  },
  kicker: {
    ...type.eyebrow,
    letterSpacing: 2,
    color: colors.mint,
  },
  theatre: {
    aspectRatio: 538 / 393,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radii.panel,
    backgroundColor: colors.mint,
  },
  theatreNarrow: { aspectRatio: undefined, height: 300 },
  pool: {
    position: "absolute",
    width: "77%",
    height: "85%",
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
  },
  bubble: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.mintDeep,
    borderRadius: 999,
  },
  bubbleOne: { left: "5%", top: "10%", width: 16, height: 16 },
  bubbleTwo: { right: "8%", top: "18%", width: 22, height: 22 },
  bubbleThree: { left: "12%", bottom: "10%", width: 24, height: 24 },
  spark: { position: "absolute", color: colors.violet, fontSize: 26 },
  sparkOne: { left: "12%", top: "18%" },
  sparkTwo: { right: "6%", bottom: "22%" },
  postcardPill: {
    alignSelf: "flex-start",
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: "#2B4553",
  },
  postcardPillLabel: { ...type.label, fontSize: 13, color: colors.mint },
  postcardTitle: { ...type.storyTitle, color: colors.surface },
  postcardLines: { gap: 0 },
  postcardSupport: { ...type.intro, color: colors.mint },
});
