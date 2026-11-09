/// <reference types="jest" />
import { act, renderHook } from "@testing-library/react-native";
import {
  addToShelf,
  parseShelf,
  STORY_SHELF_LIMIT,
} from "../../shared/storyShelf";
import { rememberStory, useStoryShelf } from "./storyShelf";

const mockStorage = { value: null as string | null };
jest.mock("./storyShelfStorage", () => ({
  readShelf: async () => mockStorage.value,
  writeShelf: async (value: string) => {
    mockStorage.value = value;
  },
}));

beforeEach(() => {
  mockStorage.value = null;
});

it("keeps the newest story first, without duplicates, up to the limit", () => {
  let shelf: string[] = [];
  for (let index = 0; index < STORY_SHELF_LIMIT + 5; index++)
    shelf = addToShelf(shelf, `story_${index}`);
  shelf = addToShelf(shelf, "story_10");
  expect(shelf).toHaveLength(STORY_SHELF_LIMIT);
  expect(shelf[0]).toBe("story_10");
  expect(shelf.filter((id) => id === "story_10")).toHaveLength(1);
});

it("treats damaged storage as an empty shelf", () => {
  expect(parseShelf(null)).toEqual([]);
  expect(parseShelf("{not json")).toEqual([]);
  expect(parseShelf('{"ids":[]}')).toEqual([]);
  expect(parseShelf('["a", 3, null, "b"]')).toEqual(["a", "b"]);
});

it("loads the saved shelf and updates every listener when a story is remembered", async () => {
  mockStorage.value = JSON.stringify(["story_old"]);
  const { result } = await renderHook(() => useStoryShelf());
  await act(async () => {});
  expect(result.current).toEqual(["story_old"]);

  await act(() => rememberStory("story_new"));
  expect(result.current).toEqual(["story_new", "story_old"]);
  expect(JSON.parse(mockStorage.value ?? "[]")).toEqual([
    "story_new",
    "story_old",
  ]);
});
