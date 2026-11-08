import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextInputInstance,
  useWindowDimensions,
  View,
} from "react-native";
import { ChoiceShelf } from "@/components/workshop/ChoiceShelf";
import { HeroPreview } from "@/components/workshop/HeroPreview";
import {
  colors,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { CustomIdeaEditor } from "./CustomIdeaEditor";
import {
  available,
  type ChoiceView,
  catalogChoice,
  choiceFor,
  labelFor,
  type WorkshopCatalog,
} from "./catalog";
import {
  type HeroPart,
  type HeroStep as HeroStepName,
  hasHeroName,
  type SetupStep,
} from "./draft";
import { Field, StepHeading, StepProgress, useShelfColumns } from "./parts";
import { useSetupDraft } from "./SetupProvider";

const TABS: { step: HeroStepName; label: string; number: string }[] = [
  { step: "character", label: "Character", number: "01" },
  { step: "outfit", label: "Outfit", number: "02" },
  { step: "quirk", label: "Quirk", number: "03" },
  { step: "name", label: "Name", number: "04" },
];

const SHELVES: Record<HeroPart, { title: string; lede: string }> = {
  character: {
    title: "Who is your hero?",
    lede: "Pick the kind of character your story follows.",
  },
  outfit: {
    title: "What are they wearing?",
    lede: "Every hero needs something splendid to wear.",
  },
  quirk: {
    title: "What makes them unusual?",
    lede: "A quirk gives the story something funny to work with.",
  },
};

export const NAME_REQUIRED = "Choose a name, then pack their bag.";
export const NAME_GUARD = "Give your hero a name to keep going.";

/**
 * Hero: Character → Outfit → Quirk → Name. Tabs may jump between them;
 * selecting changes only that category. The name starts empty and gates the
 * Backpack step.
 */
export function HeroStep({
  catalog,
  nameGuarded,
  onBack,
  onPackBag,
  onStep,
}: {
  catalog: WorkshopCatalog;
  /** True after another control tried to pass a blank name. */
  nameGuarded: number;
  onBack: () => void;
  onPackBag: () => void;
  onStep: (step: SetupStep) => void;
}) {
  const { draft, dispatch, shelfOffsets } = useSetupDraft();
  const { width } = useWindowDimensions();
  const [editingIdea, setEditingIdea] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const wide = width >= layout.splitMinWidth;
  const columns = useShelfColumns();
  const nameRef = useRef<TextInputInstance>(null);
  const tabIndex = TABS.findIndex((tab) => tab.step === draft.heroStep);
  const shelves: Record<HeroPart, ChoiceView[]> = {
    character: catalog.characters,
    outfit: catalog.outfits,
    quirk: catalog.quirks,
  };

  useEffect(() => {
    if (nameGuarded && draft.heroStep === "name") nameRef.current?.focus();
  }, [nameGuarded, draft.heroStep]);

  const next = TABS[tabIndex + 1];
  const previous = TABS[tabIndex - 1];
  const named = hasHeroName(draft);

  if (editingIdea)
    return <CustomIdeaEditor onClose={() => setEditingIdea(false)} />;

  const summary = (
    <View style={wide && styles.previewColumnWide}>
      <HeroSummary catalog={catalog} hint={next?.label} />
    </View>
  );
  const shelf = (
    <View style={styles.shelf}>
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = tab.step === draft.heroStep;
          return (
            <Pressable
              key={tab.step}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() =>
                dispatch({ type: "goToHeroStep", heroStep: tab.step })
              }
              style={[
                styles.tab,
                width < layout.phoneMaxWidth && styles.tabPhone,
                active && styles.tabActive,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  width < layout.phoneMaxWidth && styles.tabLabelPhone,
                  active && styles.tabLabelOn,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {draft.heroStep === "name" ? (
        <View style={styles.name}>
          <Text accessibilityRole="header" style={styles.shelfTitle}>
            What is your hero called?
          </Text>
          <Field
            inputRef={nameRef}
            label="Hero name"
            placeholder="Hero name"
            value={draft.heroName}
            onChangeText={(value) => dispatch({ type: "setHeroName", value })}
            autoCapitalize="words"
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={onPackBag}
            error={nameGuarded && !named ? NAME_GUARD : null}
            hint={named ? undefined : NAME_REQUIRED}
          />
        </View>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.shelfTitle}>
            {SHELVES[draft.heroStep].title}
          </Text>
          <Text style={styles.shelfLede}>{SHELVES[draft.heroStep].lede}</Text>
          <View style={styles.shelfBar}>
            <Text style={styles.count}>
              {available(shelves[draft.heroStep]).length}{" "}
              {draft.heroStep === "character"
                ? "characters"
                : draft.heroStep === "outfit"
                  ? "outfits"
                  : "quirks"}
            </Text>
            <WorkshopButton
              label="Shuffle"
              variant="shuffle"
              style={styles.shuffle}
              disabled={
                available(shelves[draft.heroStep]).filter(
                  (row) =>
                    row.optionId !== draft[draft.heroStep as HeroPart].optionId,
                ).length === 0
              }
              onPress={() => {
                const options = available(
                  shelves[draft.heroStep as HeroPart],
                ).filter(
                  (row) =>
                    row.optionId !== draft[draft.heroStep as HeroPart].optionId,
                );
                const option =
                  options[Math.floor(Math.random() * options.length)];
                if (option) {
                  dispatch({
                    type: "selectHero",
                    part: draft.heroStep as HeroPart,
                    choice: catalogChoice(option),
                  });
                  setAnnouncement(`Selected ${option.displayLabel}`);
                }
              }}
            />
          </View>
          <ChoiceShelf
            category={draft.heroStep}
            label={SHELVES[draft.heroStep].title}
            options={available(shelves[draft.heroStep])}
            selectedId={draft[draft.heroStep].optionId ?? ""}
            columns={columns}
            offsets={shelfOffsets}
            onSelect={(option) =>
              dispatch({
                type: "selectHero",
                part: draft.heroStep as HeroPart,
                choice: catalogChoice(option),
              })
            }
          />
          <Text accessibilityLiveRegion="polite" style={styles.announcement}>
            {announcement}
          </Text>
          {draft.heroStep === "character" &&
          choiceFor(catalog.characters, draft.character)?.supportsGender ? (
            <View style={styles.gender}>
              <Text style={styles.genderLabel}>Gender (optional)</Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Hero gender"
                style={styles.tabs}
              >
                {(["open", "girl", "boy", "non-binary"] as const).map(
                  (value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: draft.kidGender === value,
                      }}
                      onPress={() => dispatch({ type: "setKidGender", value })}
                      style={[
                        styles.tab,
                        draft.kidGender === value && styles.tabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabLabel,
                          draft.kidGender === value && styles.tabLabelOn,
                        ]}
                      >
                        {value === "open"
                          ? "Leave open"
                          : value === "non-binary"
                            ? "Non-binary"
                            : value === "girl"
                              ? "Girl"
                              : "Boy"}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            </View>
          ) : null}
          <View style={styles.ideas}>
            <WorkshopButton
              label="Tell us your idea"
              variant="secondary"
              style={styles.ideaButton}
              onPress={() => {
                dispatch({
                  type: "openIdeaEditor",
                  part: draft.heroStep as HeroPart,
                });
                setEditingIdea(true);
              }}
            />
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.step}>
      <StepProgress current={draft.step} onSelect={onStep} variant="crumb" />
      <StepHeading
        eyebrow=""
        title="Create your hero"
        lede="Mix a character, an outfit and a quirk, then give them a name."
      />
      <View style={[styles.split, wide && styles.splitWide]}>
        {wide ? shelf : summary}
        {wide ? summary : shelf}
      </View>
      <View style={[styles.actions, wide && styles.actionsWide]}>
        <WorkshopButton
          label="← Back"
          variant="secondary"
          style={wide ? styles.backButton : undefined}
          onPress={() =>
            previous
              ? dispatch({ type: "goToHeroStep", heroStep: previous.step })
              : onBack()
          }
        />
        {next ? (
          <WorkshopButton
            label={`Next: ${next.label} →`}
            style={wide ? styles.nextButton : undefined}
            onPress={() =>
              dispatch({ type: "goToHeroStep", heroStep: next.step })
            }
          />
        ) : (
          <WorkshopButton
            label="Pack their bag →"
            style={wide ? styles.nextButton : undefined}
            disabled={!named}
            accessibilityHint={named ? undefined : NAME_REQUIRED}
            onPress={onPackBag}
          />
        )}
      </View>
    </View>
  );
}

/** Decorative layered portrait with one concise accessible text summary. */
export function HeroSummary({
  catalog,
  hint,
}: {
  catalog: WorkshopCatalog;
  hint?: string;
}) {
  const { draft } = useSetupDraft();
  const { width } = useWindowDimensions();
  const name = draft.heroName.trim();
  const parts = [
    labelFor(catalog.characters, draft.character),
    choiceFor(catalog.characters, draft.character)?.supportsGender &&
      draft.kidGender !== "open" &&
      `Gender: ${draft.kidGender}`,
    draft.revealed.outfit && labelFor(catalog.outfits, draft.outfit),
    draft.revealed.quirk && labelFor(catalog.quirks, draft.quirk),
    draft.details && `Extra detail: ${draft.details.description}`,
  ].filter(Boolean);
  const preview = (
    <HeroPreview
      character={choiceFor(catalog.characters, draft.character)}
      outfit={
        draft.revealed.outfit
          ? choiceFor(catalog.outfits, draft.outfit)
          : undefined
      }
      quirk={
        draft.revealed.quirk
          ? choiceFor(catalog.quirks, draft.quirk)
          : undefined
      }
      size={320}
    />
  );
  const custom = [
    draft.character,
    draft.outfit,
    draft.quirk,
    draft.details,
  ].some((choice) => choice?.kind === "custom");
  if (width < layout.splitMinWidth)
    return (
      <View style={styles.previewWrap}>
        <View accessible style={styles.phoneSummary}>
          <View style={styles.phoneArt}>
            <HeroPreview
              character={choiceFor(catalog.characters, draft.character)}
              outfit={
                draft.revealed.outfit
                  ? choiceFor(catalog.outfits, draft.outfit)
                  : undefined
              }
              quirk={
                draft.revealed.quirk
                  ? choiceFor(catalog.quirks, draft.quirk)
                  : undefined
              }
              size={86}
            />
          </View>
          <View style={styles.phoneText}>
            <Text style={styles.phoneName}>{name || "Your hero"}</Text>
            <Text style={styles.phoneParts}>{parts.join(" · ")}</Text>
            <Text style={styles.phoneHint}>
              {hint
                ? `Choose the ${hint.toLowerCase()} next.`
                : "An adventure awaits."}
            </Text>
          </View>
        </View>
        {custom ? (
          <Text style={styles.reassurance}>
            Your custom ideas are represented in words.
          </Text>
        ) : null}
      </View>
    );
  return (
    <View style={styles.previewWrap}>
      <View accessible style={styles.summary}>
        <Text style={styles.kicker}>YOUR HERO, TAKING SHAPE</Text>
        <View style={styles.theatre}>
          <View style={styles.pool} />
          {preview}
        </View>
        <Text style={styles.summaryName}>{name || "Your hero"}</Text>
        <Text style={styles.summaryText}>{parts.join(" · ")}</Text>
        <Text style={styles.summaryHint}>
          {hint
            ? `Choose the ${hint.toLowerCase()} next.`
            : "An adventure awaits."}
        </Text>
        {custom ? (
          <Text style={styles.summaryNote}>
            Your custom ideas are represented in words.
          </Text>
        ) : null}
      </View>
      <Text style={styles.reassurance}>
        Every choice helps make this hero yours.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.xl },
  split: { gap: spacing.xl },
  splitWide: { flexDirection: "row", alignItems: "flex-start" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  tab: {
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: 218,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.ink },
  tabPhone: { paddingHorizontal: 2 },
  tabLabel: { ...type.label, color: colors.ink, textAlign: "center" },
  tabLabelPhone: { fontSize: 13 },
  tabLabelOn: { color: colors.surface },
  shelf: { flex: 1, gap: spacing.md, minWidth: 0 },
  shelfTitle: { ...type.title, color: colors.ink },
  shelfLede: { ...type.body, color: colors.mutedInk },
  shelfBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  count: { ...type.label, color: colors.ink },
  shuffle: { minHeight: 46, minWidth: 200, paddingHorizontal: spacing.xl },
  announcement: { ...type.small, color: colors.mutedInk, minHeight: 20 },
  gender: { gap: spacing.sm },
  genderLabel: { ...type.label, color: colors.ink },
  ideas: { flexDirection: "row" },
  ideaButton: { minHeight: 46 },
  name: { gap: spacing.md, maxWidth: 520 },
  previewWrap: { width: "100%", gap: spacing.md },
  previewColumnWide: { flexBasis: 528, flexGrow: 0, flexShrink: 0 },
  phoneSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  phoneArt: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.card,
    backgroundColor: colors.mint,
    overflow: "hidden",
  },
  phoneText: { flex: 1, gap: spacing.xs },
  phoneName: {
    ...type.cardTitle,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
  },
  phoneParts: { ...type.small, color: colors.mutedInk },
  phoneHint: { ...type.small, color: colors.mutedInk },
  summary: {
    gap: spacing.lg,
    padding: spacing.xxl - 2,
    borderRadius: radii.postcard,
    backgroundColor: colors.ink,
  },
  kicker: { ...type.eyebrow, letterSpacing: 2, color: colors.mint },
  theatre: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radii.panel,
    backgroundColor: colors.mint,
  },
  pool: {
    position: "absolute",
    width: "82%",
    height: "82%",
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
  },
  summaryName: { ...type.storyTitle, color: colors.surface },
  summaryText: { ...type.intro, color: colors.surface },
  summaryHint: { ...type.intro, color: colors.mint },
  summaryNote: { ...type.small, color: colors.mint },
  reassurance: {
    ...type.small,
    color: colors.mutedInk,
    textAlign: "center",
  },
  actions: { gap: spacing.md },
  actionsWide: { flexDirection: "row", gap: spacing.lg },
  backButton: { flexBasis: 235, flexGrow: 0 },
  nextButton: { flex: 1 },
});
