/// <reference types="jest" />
import type { Id } from "@convex/_generated/dataModel";
import { act, fireEvent, render } from "@testing-library/react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { saveBook } from "@/lib/saveBook";
import StoryScreen from "../app/story/[storyId]";

jest.mock("@/lib/BackendProvider", () => ({
  useReconnectBackend: () => jest.fn(),
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@/lib/saveBook", () => ({
  bookDeliveryLabel: "📖 Download the Book",
  saveBook: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("convex/react", () => ({
  useQuery: jest.fn(),
  useAction: jest.fn(() => jest.fn()),
  useMutation: jest.fn(() => jest.fn()),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    inflightMutations: 0,
    inflightActions: 0,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (useAction as jest.Mock).mockImplementation(() => jest.fn());
  (useMutation as jest.Mock).mockImplementation(() => jest.fn());
  (saveBook as jest.Mock).mockReset();
});

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
  expect(view.queryByText("Write this chapter")).toBeNull();
  expect(view.getByText("Next chapter →")).toBeTruthy();

  (useQuery as jest.Mock).mockReturnValue(unpublished());
  await view.rerender(<StoryScreen />);
  expect(view.getByText("Write this chapter")).toBeTruthy();

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
  expect(
    view.getByRole("button", { name: "Write this chapter" }),
  ).toBeDisabled();
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

  await fireEvent.press(
    view.getByRole("button", { name: "Chapter 1: The Kite Chase. Read again" }),
  );
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

it("restores the chapter retry control and error after a reload", async () => {
  const write = jest.fn();
  (useAction as jest.Mock).mockReturnValue(write);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...unpublished(),
    chapters: [
      {
        ...unpublished().chapters[0],
        writingError: "Your choice is saved. Try again.",
      },
    ],
  });
  const view = await render(<StoryScreen />);
  expect(view.getByText("Your choice is saved. Try again.")).toBeTruthy();
  await fireEvent.press(view.getByText("Try chapter again"));
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({ chapterId: "chapter_1" }),
  );
});

it("shows retry progress and prevents a second write after a reload", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...unpublished(),
    chapters: [
      {
        ...unpublished().chapters[0],
        status: "WRITING",
        writingRunId: "run_1",
        writingRetry: { attempt: 3, maxAttempts: 4, nextRetryAt: 1000 },
      },
    ],
  });
  const view = await render(<StoryScreen />);
  expect(view.getByText(/Trying again \(3\/4\)/)).toBeTruthy();
  expect(
    view.getByRole("button", { name: "Writing…" }).props.accessibilityState
      .disabled,
  ).toBe(true);
});

it("shows export progress then offers retry when the saved export fails", async () => {
  const retry = jest.fn();
  (useMutation as jest.Mock).mockReturnValue(retry);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  const completed = { ...story, chapters: [{ ...chapter, status: "LOCKED" }] };
  (useQuery as jest.Mock).mockReturnValue({
    ...completed,
    story: { ...story.story, exportStatus: "PREPARING_COVER" },
  });
  const view = await render(<StoryScreen />);
  expect(view.getByText("Painting your cover…")).toBeTruthy();
  expect(view.queryByText("Try download again")).toBeNull();
  (useQuery as jest.Mock).mockReturnValue({
    ...completed,
    story: {
      ...story.story,
      exportStatus: "FAILED",
      exportError: "Your chapters are saved. Try again.",
    },
  });
  await view.rerender(<StoryScreen />);
  expect(view.getByText("Your chapters are saved. Try again.")).toBeTruthy();
  await fireEvent.press(view.getByText("Try download again"));
  expect(retry).toHaveBeenCalledWith(
    expect.objectContaining({ storyId: "story_1" }),
  );
});

it("keeps a ready download available when saving the file fails", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...story,
    story: { ...story.story, epubUrl: "https://example.test/book.epub" },
    chapters: [{ ...chapter, status: "LOCKED" }],
  });
  (saveBook as jest.Mock)
    .mockRejectedValueOnce(new Error("network failure"))
    .mockResolvedValueOnce(undefined);
  const view = await render(<StoryScreen />);
  await fireEvent.press(view.getByText("📖 Download the Book"));
  expect(view.getByText(/We couldn't save the book/)).toBeTruthy();
  await fireEvent.press(view.getByText("📖 Download the Book"));
  expect(saveBook).toHaveBeenCalledTimes(2);
  expect(saveBook).toHaveBeenLastCalledWith(
    "https://example.test/book.epub",
    "The Windy Kite",
    expect.any(Function),
  );
  expect(view.queryByText(/We couldn't save the book/)).toBeNull();
});

it("prevents future chapter navigation and returns from a reread without mutating chapters", async () => {
  const mutation = jest.fn();
  (useMutation as jest.Mock).mockReturnValue(mutation);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue({
    ...story,
    chapters: [
      {
        ...chapter,
        _id: "past",
        status: "LOCKED",
        title: "First adventure",
        paragraphs: ["Saved first chapter."],
      },
      {
        ...chapter,
        _id: "active",
        index: 2,
        status: "DIRECTING",
        paragraphs: [],
      },
      {
        ...chapter,
        _id: "future",
        index: 3,
        status: "PITCHING",
        beatCards: [],
        paragraphs: [],
      },
    ],
  });
  const view = await render(<StoryScreen />);
  expect(
    view.getByRole("button", { name: "Chapter 3. Not ready yet" }),
  ).toBeDisabled();
  await fireEvent.press(
    view.getByRole("button", {
      name: "Chapter 1: First adventure. Read again",
    }),
  );
  expect(view.getByText("Saved first chapter.")).toBeTruthy();
  expect(view.queryByText("Write this chapter")).toBeNull();
  await fireEvent.press(view.getByText("Return to the current chapter"));
  expect(view.getByText("Write this chapter")).toBeTruthy();
  expect(mutation).not.toHaveBeenCalled();
});

it("waits for card selection to finish before writing and keeps choice separate from generation", async () => {
  let finish!: () => void;
  const choose = jest.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const write = jest.fn();
  (useMutation as jest.Mock).mockReturnValue(choose);
  (useAction as jest.Mock).mockReturnValue(write);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue(unpublished());
  const view = await render(<StoryScreen />);
  await fireEvent.press(
    view.getByRole("radio", { name: "Wind Race!. Run past the boats!" }),
  );
  expect(choose).toHaveBeenCalledTimes(1);
  expect(
    view.getByRole("button", { name: "Write this chapter" }),
  ).toBeDisabled();
  expect(write).not.toHaveBeenCalled();
  await act(() => finish());
  await fireEvent.press(view.getByText("Write this chapter"));
  expect(write).toHaveBeenCalledTimes(1);
});

it("distinguishes unresolved and missing stories while preserving a way back to the workshop", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ storyId: "story_1" });
  (useQuery as jest.Mock).mockReturnValue(undefined);
  const view = await render(<StoryScreen />);
  expect(view.getByLabelText("Loading story")).toBeTruthy();
  expect(view.getByText("Back to the workshop")).toBeTruthy();
  (useQuery as jest.Mock).mockReturnValue(null);
  await view.rerender(<StoryScreen />);
  expect(view.getByText("Story not found")).toBeTruthy();
  expect(view.queryByLabelText("Loading story")).toBeNull();
});
