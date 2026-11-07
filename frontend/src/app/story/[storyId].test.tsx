/// <reference types="jest" />
import type { Id } from "@convex/_generated/dataModel";
import { fireEvent, render } from "@testing-library/react-native";
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
  expect(view.getByText("Next Chapter →")).toBeTruthy();

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

it("reopens a finished chapter from the list", async () => {
  const finished = {
    ...chapter,
    _id: "chapter_one" as Id<"chapters">,
    index: 1,
    status: "LOCKED" as const,
    title: "The Kite Chase",
    paragraphs: ["Chapter one words."],
  };
  const current = {
    ...chapter,
    _id: "chapter_two" as Id<"chapters">,
    index: 2,
    status: "REVIEWING" as const,
    title: "The Bathtub",
    paragraphs: ["Chapter two words."],
  };

  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...story,
    chapters: [finished, current],
  });

  const view = await render(<StoryScreen />);
  expect(view.getByText("Chapter two words.")).toBeTruthy();
  expect(view.queryByText("Chapter one words.")).toBeNull();

  await fireEvent.press(view.getByText("1 · The Kite Chase"));
  expect(view.getByText("Chapter one words.")).toBeTruthy();
});

it("offers the finished book for download", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...story,
    story: { ...story.story, epubUrl: "http://localhost/epub/book.epub" },
    chapters: story.chapters.map((entry) => ({
      ...entry,
      status: "LOCKED" as const,
    })),
  });

  const view = await render(<StoryScreen />);
  expect(view.getByText("📖 Download the Book")).toBeTruthy();
  expect(view.getByText("The End 🎉")).toBeTruthy();
});
