/// <reference types="jest" />
import type { Id } from "@convex/_generated/dataModel";
import { render } from "@testing-library/react-native";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import StoryScreen from "./[storyId]";

jest.mock("expo-router", () => ({ useLocalSearchParams: jest.fn() }));
jest.mock("convex/react", () => ({
  useQuery: jest.fn(),
  useAction: jest.fn(() => jest.fn()),
  useMutation: jest.fn(() => jest.fn()),
}));

const chapter = {
  _id: "chapter_1" as Id<"chapters">,
  _creationTime: 0,
  storyId: "story_1" as Id<"stories">,
  index: 1,
  arcRole: "HOOK_AND_INCITING_INCIDENT",
  status: "REVIEWING" as const,
  beatCards: [
    {
      cardId: "card_1a",
      style: "BOLD_ACTION" as const,
      title: "Wind Race!",
      kidFriendlyPitch: "Run past the boats!",
      iconEmoji: "🏃",
    },
  ],
  chosenBeat: {
    cardId: "card_1a",
    style: "BOLD_ACTION" as const,
    title: "Wind Race!",
    kidFriendlyPitch: "Run past the boats!",
    iconEmoji: "🏃",
  },
  paragraphs: ["Mira held the string tight.", "The kite danced away."],
  summaryBullets: [],
  vocabNotes: [],
  extractionStatus: "PENDING" as const,
};

const story = {
  story: {
    _id: "story_1" as Id<"stories">,
    _creationTime: 0,
    title: "The Windy Kite",
    status: "SETUP" as const,
    readingLevel: "AGES_7_9" as const,
    totalChapters: 5,
    vibe: "SILLY_ADVENTURE",
    artStyle: "watercolour",
    worldState: {
      setting: "A seaside town",
      centralProblem: "The kite blew away",
      unresolvedThreads: [],
    },
    items: [],
    createdAt: 0,
  },
  chapters: [chapter],
};

function unpublished() {
  return {
    ...story,
    chapters: [{ ...chapter, status: "DIRECTING" as const, paragraphs: [] }],
  };
}

it("reads back the prose, then offers to write once a card is picked", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue(story);

  const view = await render(<StoryScreen />);

  expect(view.getByText("Mira held the string tight.")).toBeTruthy();
  expect(view.queryByText("🪄 Write Chapter!")).toBeNull();

  (useQuery as jest.Mock).mockReturnValue(unpublished());
  await view.rerender(<StoryScreen />);
  expect(view.getByText("🪄 Write Chapter!")).toBeTruthy();

  (useQuery as jest.Mock).mockReturnValue({
    ...story,
    chapters: [
      {
        ...chapter,
        status: "DIRECTING",
        paragraphs: [],
        chosenBeat: undefined,
      },
    ],
  });
  await view.rerender(<StoryScreen />);
  expect(view.queryByText("🪄 Write Chapter!")).toBeNull();
});
