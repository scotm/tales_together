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
} from "./draft";
import { Field, StepHeading, setupStyles, useShelfColumns } from "./parts";
import { useSetupDraft } from "./SetupProvider";

const TABS: { step: HeroStepName; label: string }[] = [
  { step: "character", label: "Character" },
  { step: "outfit", label: "Outfit" },
  { step: "quirk", label: "Quirk" },
  { step: "name", label: "Name" },
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
}: {
  catalog: WorkshopCatalog;
  /** True after another control tried to pass a blank name. */
  nameGuarded: number;
  onBack: () => void;
  onPackBag: () => void;
}) {
  const { draft, dispatch, shelfOffsets } = useSetupDraft();
  const { width } = useWindowDimensions();
  const [announcement, setAnnouncement] = useState("");
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

  return (
    <View style={styles.step}>
      <StepHeading
        eyebrow="Step 2 · Hero"
        title="Create your hero"
        lede="Mix a character, an outfit and a quirk, then give them a name."
      />
      <View accessibilityRole="tablist" style={styles.tabs}>
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
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelOn]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection:
            width >= layout.splitMinWidth ? "row-reverse" : "column",
          gap: spacing.xl,
          alignItems: "stretch",
        }}
      >
        <View
          style={{ flexBasis: width >= layout.splitMinWidth ? 320 : undefined }}
        >
          <HeroSummary catalog={catalog} />
        </View>
        <View style={{ flex: 1, gap: spacing.md }}>
          {draft.heroStep === "name" ? (
            <View style={styles.name}>
              <Text accessibilityRole="header" style={setupStyles.sectionTitle}>
                What is your hero called?
              </Text>
              <Field
                inputRef={nameRef}
                label="Hero name"
                placeholder="Hero name"
                value={draft.heroName}
                onChangeText={(value) =>
                  dispatch({ type: "setHeroName", value })
                }
                autoCapitalize="words"
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={onPackBag}
                error={nameGuarded && !named ? NAME_GUARD : null}
                hint={named ? undefined : NAME_REQUIRED}
              />
            </View>
          ) : (
            <View style={styles.shelf}>
              <Text accessibilityRole="header" style={setupStyles.sectionTitle}>
                {SHELVES[draft.heroStep].title}
              </Text>
              <Text style={setupStyles.muted}>
                {SHELVES[draft.heroStep].lede}
              </Text>
              <ChoiceShelf
                category={draft.heroStep}
                label={SHELVES[draft.heroStep].title}
                options={available(shelves[draft.heroStep])}
                selectedId={draft[draft.heroStep].optionId}
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
              <WorkshopButton
                label="Shuffle"
                variant="shuffle"
                disabled={
                  available(shelves[draft.heroStep]).filter(
                    (row) =>
                      row.optionId !==
                      draft[draft.heroStep as HeroPart].optionId,
                  ).length === 0
                }
                onPress={() => {
                  const options = available(
                    shelves[draft.heroStep as HeroPart],
                  ).filter(
                    (row) =>
                      row.optionId !==
                      draft[draft.heroStep as HeroPart].optionId,
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
              <Text accessibilityLiveRegion="polite" style={setupStyles.muted}>
                {announcement}
              </Text>
              {draft.heroStep === "character" &&
              choiceFor(catalog.characters, draft.character)?.supportsGender ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={setupStyles.sectionTitle}>
                    Gender (optional)
                  </Text>
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
                          onPress={() =>
                            dispatch({ type: "setKidGender", value })
                          }
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
            </View>
          )}
        </View>
      </View>
      <View style={setupStyles.actions}>
        <WorkshopButton
          label="← Back"
          variant="secondary"
          onPress={() =>
            previous
              ? dispatch({ type: "goToHeroStep", heroStep: previous.step })
              : onBack()
          }
        />
        {next ? (
          <WorkshopButton
            label={`Next: ${next.label} →`}
            onPress={() =>
              dispatch({ type: "goToHeroStep", heroStep: next.step })
            }
          />
        ) : (
          <WorkshopButton
            label="Pack their bag →"
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
export function HeroSummary({ catalog }: { catalog: WorkshopCatalog }) {
  const { draft } = useSetupDraft();
  const name = draft.heroName.trim();
  const parts = [
    labelFor(catalog.characters, draft.character),
    choiceFor(catalog.characters, draft.character)?.supportsGender &&
      draft.kidGender !== "open" &&
      `Gender: ${draft.kidGender}`,
    draft.revealed.outfit && labelFor(catalog.outfits, draft.outfit),
    draft.revealed.quirk && labelFor(catalog.quirks, draft.quirk),
  ].filter(Boolean);
  return (
    <View accessible style={styles.summary}>
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
      />
      <Text style={styles.summaryName}>{name || "Your hero"}</Text>
      <Text style={styles.summaryText}>{parts.join(" · ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.xl },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tab: {
    minHeight: layout.minTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabLabel: { ...type.label, color: colors.ink },
  tabLabelOn: { color: colors.surface },
  summary: {
    gap: spacing.xs,
    padding: spacing.xl,
    borderRadius: radii.panel,
    backgroundColor: colors.mint,
  },
  summaryName: { ...type.storyTitle, color: colors.ink },
  summaryText: { ...type.body, color: colors.ink },
  shelf: { gap: spacing.sm },
  name: { gap: spacing.md, maxWidth: 520 },
});
