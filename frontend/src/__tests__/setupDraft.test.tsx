/// <reference types="jest" />

import type { Id } from "@convex/_generated/dataModel";
import {
  createDraft,
  draftContext,
  setupReducer,
} from "@/features/setup/draft";
import { contextKey } from "../../shared/heroIdeas";
import { defaultsFixture } from "./fixtures/workshopCatalog";

it("keeps earlier custom ideas and unfinished edits available after changing categories and choosing a preset", () => {
  if (!defaultsFixture) throw new Error("Missing defaults");
  let draft = createDraft(defaultsFixture);
  draft = setupReducer(draft, { type: "setHeroName", value: "Mira" });
  draft = setupReducer(draft, { type: "openIdeaEditor", part: "outfit" });
  draft = setupReducer(draft, {
    type: "setIdeaText",
    text: "A blue cape",
    source: "typed",
  });
  draft = setupReducer(draft, {
    type: "applyIdea",
    expectedContext: contextKey(draftContext(draft)),
    choices: [
      {
        kind: "custom",
        ideaId: "old_idea" as Id<"heroIdeas">,
        part: "outfit",
        key: "custom_outfit",
        label: "Cape",
        description: "wearing a blue cape",
        confirmedText: "A blue cape",
        source: "typed",
        expiresAt: Date.now() + 60_000,
      },
    ],
  });
  draft = setupReducer(draft, {
    type: "selectHero",
    part: "outfit",
    choice: defaultsFixture.outfit,
  });
  draft = setupReducer(draft, { type: "openIdeaEditor", part: "quirk" });
  draft = setupReducer(draft, {
    type: "setIdeaText",
    text: "Star hiccups",
    source: "spoken",
  });
  draft = setupReducer(draft, { type: "openIdeaEditor", part: "outfit" });
  expect(draft.ideaText).toBe("A blue cape");
  expect(draft.outfit.kind).toBe("catalog");
  draft = setupReducer(draft, {
    type: "setIdeaText",
    text: "A purple cape",
    source: "typed",
  });
  draft = setupReducer(draft, { type: "openIdeaEditor", part: "quirk" });
  expect(draft.ideaText).toBe("Star hiccups");
  draft = setupReducer(draft, { type: "openIdeaEditor", part: "outfit" });
  expect(draft.ideaText).toBe("A purple cape");
  expect(draft.customHistory.outfit?.description).toBe("wearing a blue cape");
  expect(draft.heroName).toBe("Mira");
});
