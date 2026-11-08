import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { colors, type } from "@/components/workshop/theme";
import {
  HeaderButton,
  WorkshopShell,
} from "@/components/workshop/WorkshopShell";
import { BackpackStep } from "@/features/setup/BackpackStep";
import { ConnectionNotice } from "@/features/setup/ConnectionNotice";
import { useWorkshopCatalog } from "@/features/setup/catalog";
import { hasHeroName, type SetupStep } from "@/features/setup/draft";
import { HeroStep } from "@/features/setup/HeroStep";
import { StepProgress } from "@/features/setup/parts";
import { RecentStoriesPanel } from "@/features/setup/RecentStoriesPanel";
import { useSetupDraft } from "@/features/setup/SetupProvider";
import { useCreateStory } from "@/features/setup/useCreateStory";
import { useRecentStories } from "@/features/setup/useRecentStories";
import { WorldStep } from "@/features/setup/WorldStep";

/**
 * The Storybook Workshop: World → Hero → Backpack. Steps are local state in
 * the session-scoped setup draft; nothing is saved until Start the story.
 */
export default function WorkshopScreen() {
  const catalog = useWorkshopCatalog();
  const { draft, dispatch } = useSetupDraft();
  const recent = useRecentStories();
  const create = useCreateStory(catalog.backpackSize);
  const [showRecent, setShowRecent] = useState(false);
  const [nameGuarded, setNameGuarded] = useState(0);

  function goTo(step: SetupStep) {
    if (step === "backpack" && !hasHeroName(draft)) {
      setNameGuarded((attempt) => attempt + 1);
    }
    dispatch({ type: "goToStep", step });
  }

  return (
    <WorkshopShell
      headerActions={
        showRecent || create.creating ? null : (
          <HeaderButton
            label="Recent stories"
            onPress={() => setShowRecent(true)}
          />
        )
      }
    >
      <ConnectionNotice recent={recent} />
      {create.creating ? (
        <View accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel="Starting your story" />
          <Text style={{ ...type.body, color: colors.ink }}>
            Starting your story… Keep this page open while we save your choices.
          </Text>
        </View>
      ) : showRecent ? (
        <RecentStoriesPanel
          recent={recent}
          onClose={() => setShowRecent(false)}
        />
      ) : (
        <>
          <StepProgress current={draft.step} onSelect={goTo} />
          {draft.step === "world" ? (
            <WorldStep catalog={catalog} onNext={() => goTo("hero")} />
          ) : null}
          {draft.step === "hero" ? (
            <HeroStep
              catalog={catalog}
              nameGuarded={nameGuarded}
              onBack={() => goTo("world")}
              onPackBag={() => goTo("backpack")}
            />
          ) : null}
          {draft.step === "backpack" ? (
            <BackpackStep
              catalog={catalog}
              canStart={!create.blockedReason && !create.creating}
              creating={create.creating}
              startBlockedReason={create.blockedReason}
              error={create.error}
              onBack={() =>
                dispatch({ type: "goToHeroStep", heroStep: "name" })
              }
              onStart={create.start}
            />
          ) : null}
        </>
      )}
    </WorkshopShell>
  );
}
