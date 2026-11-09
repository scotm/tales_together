import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { colors, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import {
  HeaderButton,
  WorkshopShell,
} from "@/components/workshop/WorkshopShell";
import { RequireSignIn } from "@/features/auth/RequireSignIn";
import { SignOutLink } from "@/features/auth/SignOutLink";
import { BackpackStep } from "@/features/setup/BackpackStep";
import { CatalogBoundary } from "@/features/setup/CatalogBoundary";
import { ConnectionNotice } from "@/features/setup/ConnectionNotice";
import {
  selectedChoices,
  useWorkshopCatalog,
  type WorkshopCatalog,
} from "@/features/setup/catalog";
import { hasHeroName, type SetupStep } from "@/features/setup/draft";
import { HeroStep } from "@/features/setup/HeroStep";
import { RecentStoriesPanel } from "@/features/setup/RecentStoriesPanel";
import { useSetupDraft } from "@/features/setup/SetupProvider";
import { useCreateStory } from "@/features/setup/useCreateStory";
import {
  type RecentStories,
  useRecentStories,
} from "@/features/setup/useRecentStories";
import { WorldStep } from "@/features/setup/WorldStep";
import { useReconnectBackend } from "@/lib/BackendProvider";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";

/**
 * The Storybook Workshop: World → Hero → Backpack. Steps are local state in
 * the session-scoped setup draft; nothing is saved until Start the story.
 */
export default function WorkshopScreen() {
  return (
    <RequireSignIn>
      <Workshop />
    </RequireSignIn>
  );
}

function Workshop() {
  const recent = useRecentStories();
  const reconnect = useReconnectBackend();
  const diagnostics = useDiagnostics();
  const [showRecent, setShowRecent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (showRecent)
    return (
      <WorkshopShell>
        <ConnectionNotice recent={recent} />
        <RecentStoriesPanel
          recent={recent}
          onClose={() => setShowRecent(false)}
        />
      </WorkshopShell>
    );
  return (
    <CatalogBoundary
      key={attempt}
      recent={recent}
      onRecent={() => setShowRecent(true)}
      onRetry={() => {
        reconnect();
        setAttempt((value) => value + 1);
      }}
      onFailure={() =>
        diagnostics.record("catalog.load_failed", {
          level: "warn",
          status: "failed",
          message: "The workshop choices could not load.",
        })
      }
    >
      <WorkshopLoader recent={recent} onRecent={() => setShowRecent(true)} />
    </CatalogBoundary>
  );
}

function WorkshopLoader({
  recent,
  onRecent,
}: {
  recent: RecentStories;
  onRecent(): void;
}) {
  const state = useWorkshopCatalog();
  const reconnect = useReconnectBackend();
  if (!state.ready || !state.catalog) {
    const pending =
      recent.connection.inflightActions || recent.connection.inflightMutations;
    return (
      <WorkshopShell
        headerActions={
          <HeaderButton label="Recent stories" onPress={onRecent} />
        }
      >
        <ConnectionNotice recent={recent} />
        <Text
          accessibilityRole="header"
          style={{ ...type.heading, color: colors.ink }}
        >
          Open the idea shelves
        </Text>
        {state.empty ? (
          <Text>The idea shelves aren’t ready yet. Try again in a moment.</Text>
        ) : state.timedOut ? (
          <Text>
            The choices are taking too long to load. Check the connection and
            try again.
          </Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading workshop choices" />
        )}
        {(state.empty || state.timedOut) && !pending ? (
          <WorkshopButton label="Retry loading choices" onPress={reconnect} />
        ) : null}
      </WorkshopShell>
    );
  }
  return (
    <WorkshopContent
      catalog={state.catalog}
      recent={recent}
      onRecent={onRecent}
    />
  );
}

function WorkshopContent({
  catalog,
  recent,
  onRecent,
}: {
  onRecent(): void;
  catalog: WorkshopCatalog;
  recent: RecentStories;
}) {
  const { draft, dispatch } = useSetupDraft();
  const create = useCreateStory(catalog);
  const [nameGuarded, setNameGuarded] = useState(0);
  const pinned = selectedChoices(draft).map((choice) =>
    catalog.options.find((row) => row.optionId === choice.optionId),
  );
  const retired = pinned.filter((row) => row && !row.active && !row.withdrawn);
  const withdrawn = pinned.some((row) => !row || row.withdrawn);

  function goTo(step: SetupStep) {
    if (step === "backpack" && !hasHeroName(draft)) {
      setNameGuarded((attempt) => attempt + 1);
    }
    dispatch({ type: "goToStep", step });
  }

  return (
    <WorkshopShell
      headerActions={
        create.creating ? null : (
          <HeaderButton label="Recent stories" onPress={onRecent} />
        )
      }
      footerActions={create.creating ? null : <SignOutLink />}
    >
      <ConnectionNotice recent={recent} />
      {create.creating ? (
        <View accessibilityLiveRegion="polite">
          <ActivityIndicator accessibilityLabel="Starting your story" />
          <Text style={{ ...type.body, color: colors.ink }}>
            Starting your story… Keep this page open while we save your choices.
          </Text>
        </View>
      ) : (
        <>
          {withdrawn ? (
            <Text
              accessibilityRole="alert"
              style={{ ...type.body, color: colors.danger }}
            >
              A selected idea is no longer available. Please replace it before
              starting the story.
            </Text>
          ) : retired.length ? (
            <Text style={{ ...type.small, color: colors.mutedInk }}>
              Some ideas have been updated. Your earlier choices are kept;
              choose a new tile if you want to change them.
            </Text>
          ) : null}
          {draft.step === "world" ? (
            <WorldStep
              catalog={catalog}
              onStep={goTo}
              onNext={() => goTo("hero")}
            />
          ) : null}
          {draft.step === "hero" ? (
            <HeroStep
              catalog={catalog}
              nameGuarded={nameGuarded}
              onStep={goTo}
              onBack={() => goTo("world")}
              onPackBag={() => goTo("backpack")}
            />
          ) : null}
          {draft.step === "backpack" ? (
            <BackpackStep
              catalog={catalog}
              onStep={goTo}
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
