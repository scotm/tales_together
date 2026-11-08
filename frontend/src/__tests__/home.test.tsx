/// <reference types="jest" />
import { act, fireEvent, render } from "@testing-library/react-native";
import { useConvexConnectionState, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { View } from "react-native";
import { SetupProvider } from "@/features/setup/SetupProvider";
import HomeScreen from "../app/index";
import { catalogFixture, fixtureChoice } from "./fixtures/workshopCatalog";

const mockRecent = jest.fn();
const mockCatalog = jest.fn();
const mockReconnect = jest.fn();
const mockCreateStory = jest.fn();
const mockPush = jest.fn();
const mockClient = { url: "http://192.168.50.176:3210" };
jest.mock("@/lib/voice/recording", () => ({ startRecording: jest.fn() }));
jest.mock("@/lib/BackendProvider", () => ({
  useReconnectBackend: () => mockReconnect,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => {},
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("convex/react", () => ({
  useQuery: jest.fn(),
  useAction: () => jest.fn(),
  useMutation: () => mockCreateStory,
  useConvex: () => mockClient,
  useConvexConnectionState: jest.fn(),
}));

const connected = {
  isWebSocketConnected: true,
  inflightMutations: 0,
  inflightActions: 0,
};

function Workshop({ clientVersion = 0 }: { clientVersion?: number }) {
  return (
    <SetupProvider>
      <View key={clientVersion}>
        <HomeScreen />
      </View>
    </SetupProvider>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCreateStory.mockReset();
  mockPush.mockReset();
  mockRecent.mockReturnValue([]);
  mockCatalog.mockReturnValue(catalogFixture);
  jest
    .mocked(useQuery)
    .mockImplementation((...args) =>
      getFunctionName(args[0]) === "catalog:listChoices"
        ? mockCatalog()
        : mockRecent(),
    );
  (useConvexConnectionState as jest.Mock).mockReturnValue(connected);
});
afterEach(() => jest.useRealTimers());

async function nameHero(
  view: Awaited<ReturnType<typeof render>>,
  name = "Mira",
) {
  await fireEvent.press(view.getByLabelText("Step 3 of 3: Backpack"));
  await fireEvent.changeText(view.getByLabelText("Hero name"), name);
}

async function packBag(view: Awaited<ReturnType<typeof render>>) {
  await nameHero(view);
  await fireEvent.press(view.getByText("Pack their bag →"));
}

it("guards every path to Backpack and retains choices through tabs and Recent stories", async () => {
  const view = await render(<Workshop />);
  await fireEvent.press(view.getByText("Make your hero →"));
  expect(view.queryByLabelText("Hero name")).toBeNull();
  await fireEvent.press(
    view.getByRole("radio", { name: "Rusty Clockwork Robot" }),
  );
  await fireEvent.press(view.getByLabelText("Step 3 of 3: Backpack"));
  expect(view.getByLabelText("Hero name").props.value).toBe("");
  expect(view.getByText("Give your hero a name to keep going.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Pack their bag →" })).toBeDisabled();
  await fireEvent.changeText(view.getByLabelText("Hero name"), "   ");
  await fireEvent(view.getByLabelText("Hero name"), "submitEditing");
  expect(view.queryByText("Start the story")).toBeNull();
  await fireEvent.changeText(view.getByLabelText("Hero name"), "Mira");
  await fireEvent.press(view.getByText("Recent stories"));
  expect(view.getByText("No stories yet. Make the first one.")).toBeTruthy();
  await fireEvent.press(view.getByText("Back to the workshop"));
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  expect(
    view.getByRole("radio", { name: "Rusty Clockwork Robot" }),
  ).toBeChecked();
  expect(mockCreateStory).not.toHaveBeenCalled();
});

it("allows direct world selection while kept and retains both Keep switches across steps", async () => {
  const view = await render(<Workshop />);
  await fireEvent.press(view.getByLabelText("Keep this place"));
  await fireEvent.press(view.getByLabelText("Keep this trouble"));
  expect(view.getByRole("button", { name: "Surprise me ↻" })).toBeDisabled();
  await fireEvent.press(view.getByLabelText("Change the place"));
  await fireEvent.press(
    view.getByRole("radio", { name: "Midnight Dinosaur Museum" }),
  );
  await fireEvent.press(view.getByText("Make your hero →"));
  await fireEvent.press(view.getByLabelText("Step 1 of 3: World"));
  expect(view.getByLabelText("Keep this place")).toBeChecked();
  expect(view.getByLabelText("Keep this trouble")).toBeChecked();
  expect(view.getAllByText("Midnight Dinosaur Museum")).toHaveLength(2);
});

it("enforces three bag items and submits the selected world, hero and author once", async () => {
  mockCreateStory.mockResolvedValue("story_new");
  const view = await render(<Workshop />);
  await packBag(view);
  await fireEvent.changeText(
    view.getByLabelText("Written by (optional)"),
    "  Alex  ",
  );
  await fireEvent.press(
    view.getByRole("checkbox", { name: "Inside-Out Umbrella" }),
  );
  expect(
    view.getByText("The bag is full. Take something out first."),
  ).toBeTruthy();
  await fireEvent.press(view.getByRole("checkbox", { name: "Golden Whisk" }));
  expect(view.getByRole("button", { name: "Start the story" })).toBeDisabled();
  await fireEvent.press(
    view.getByRole("checkbox", { name: "Inside-Out Umbrella" }),
  );
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).toHaveBeenCalledTimes(1);
  expect(mockCreateStory).toHaveBeenCalledWith(
    expect.objectContaining({
      protagonistName: "Mira",
      authorName: "Alex",
      setting: fixtureChoice("set_bakery"),
      character: fixtureChoice("hero_otter"),
      packed: [
        fixtureChoice("item_jam"),
        fixtureChoice("item_kazoo"),
        fixtureChoice("item_umbrella"),
      ],
      kidGender: "open",
    }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/story/[storyId]",
    params: { storyId: "story_new" },
  });
  // The successful draft is reset for the next book.
  expect(view.getByText("Build a world")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Step 3 of 3: Backpack"));
  expect(view.getByLabelText("Hero name").props.value).toBe("");
});

it("preserves the draft on creation failure and lets the child retry", async () => {
  mockCreateStory.mockRejectedValueOnce(new Error("Please try again."));
  const view = await render(<Workshop />);
  await packBag(view);
  await fireEvent.changeText(
    view.getByLabelText("Written by (optional)"),
    "Alex",
  );
  await fireEvent.press(view.getByText("Start the story"));
  expect(view.getByText("Please try again.")).toBeTruthy();
  expect(view.getByDisplayValue("Alex")).toBeTruthy();
  expect(view.getByText("Mira")).toBeTruthy();
  expect(view.getByRole("checkbox", { name: "Golden Whisk" })).toBeChecked();
  expect(mockPush).not.toHaveBeenCalled();
  mockCreateStory.mockResolvedValueOnce("story_retry");
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).toHaveBeenCalledTimes(2);
  expect(mockPush).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { storyId: "story_retry" },
    }),
  );
});

it("keeps a pending creation stable and blocks retries that could discard it", async () => {
  let finish!: (id: string) => void;
  mockCreateStory.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(<Workshop />);
  await packBag(view);
  await fireEvent.press(view.getByText("Start the story"));
  expect(view.getByLabelText("Starting your story")).toBeTruthy();
  expect(view.queryByText("Start the story")).toBeNull();
  expect(view.queryByLabelText("Step 1 of 3: World")).toBeNull();
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
    inflightMutations: 1,
  });
  await view.rerender(<Workshop />);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.queryByText("Try connecting again")).toBeNull();
  expect(view.getByText(/Waiting for your pending request/)).toBeTruthy();
  expect(mockCreateStory).toHaveBeenCalledTimes(1);
  await act(() => finish("story_pending"));
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("replaces an unresolved spinner with recovery and retains the draft through a client remount", async () => {
  mockRecent.mockReturnValue(undefined);
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
  });
  const view = await render(<Workshop />);
  await nameHero(view);
  await fireEvent.press(view.getByText("Recent stories"));
  expect(view.getByLabelText("Loading recent stories")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.queryByLabelText("Loading recent stories")).toBeNull();
  expect(view.getByText(/Cannot connect to the story server/)).toBeTruthy();
  expect(view.getByText(/192.168.50.176:3210/)).toBeTruthy();
  await fireEvent.press(view.getByText("Try connecting again"));
  expect(mockReconnect).toHaveBeenCalledTimes(1);
  (useConvexConnectionState as jest.Mock).mockReturnValue(connected);
  mockRecent.mockReturnValue([]);
  mockCatalog.mockReturnValue(catalogFixture);
  jest
    .mocked(useQuery)
    .mockImplementation((...args) =>
      getFunctionName(args[0]) === "catalog:listChoices"
        ? mockCatalog()
        : mockRecent(),
    );
  await view.rerender(<Workshop clientVersion={1} />);
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
  expect(view.queryByText(/Cannot connect/)).toBeNull();
});

it("allows local choices offline while blocking story creation", async () => {
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
  });
  const view = await render(<Workshop />);
  await packBag(view);
  expect(view.getByText("Mira")).toBeTruthy();
  expect(view.getByRole("button", { name: "Start the story" })).toBeDisabled();
  expect(
    view.getByText("Connect to the story server before starting a story."),
  ).toBeTruthy();
  expect(mockCreateStory).not.toHaveBeenCalled();
});

it("reports a stalled query even when its socket is connected", async () => {
  mockRecent.mockReturnValue(undefined);
  const view = await render(<Workshop />);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.getByText(/taking too long to respond/)).toBeTruthy();
});

it("keeps cached stories when a reconnect query resets and refuses to discard queued writes", async () => {
  mockRecent.mockReturnValue([
    { _id: "story_1", title: "The Windy Kite", totalChapters: 5 },
  ]);
  const view = await render(<Workshop />);
  await fireEvent.press(view.getByText("Recent stories"));
  mockRecent.mockReturnValue(undefined);
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
    inflightMutations: 1,
  });
  await view.rerender(<Workshop />);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.getByText("The Windy Kite")).toBeTruthy();
  expect(view.queryByLabelText("Loading recent stories")).toBeNull();
  expect(view.queryByText("Try connecting again")).toBeNull();
  expect(view.getByText(/Waiting for your pending request/)).toBeTruthy();
});

it("waits for the Convex catalogue without substituting source defaults, while keeping recent books reachable", async () => {
  mockCatalog.mockReturnValue(undefined);
  mockRecent.mockReturnValue([
    { _id: "old_story", title: "An old book", totalChapters: 5 },
  ]);
  const view = await render(<Workshop />);
  expect(view.getByLabelText("Loading workshop choices")).toBeTruthy();
  expect(view.queryByText("Build a world")).toBeNull();
  await fireEvent.press(view.getByText("Recent stories"));
  expect(view.getByText("An old book")).toBeTruthy();
  await fireEvent.press(view.getByText("Back to the workshop"));
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.getByText(/choices are taking too long/)).toBeTruthy();
  await fireEvent.press(view.getByText("Retry loading choices"));
  expect(mockReconnect).toHaveBeenCalledTimes(1);
  mockCatalog.mockReturnValue(catalogFixture);
  await view.rerender(<Workshop />);
  expect(view.getByText("Build a world")).toBeTruthy();
});

it("renders an explicit empty catalogue state and can recover from a query failure", async () => {
  mockCatalog.mockReturnValue({ backpackSize: 3, options: [] });
  const view = await render(<Workshop />);
  expect(view.getByText(/idea shelves aren’t ready/)).toBeTruthy();
  expect(view.queryByLabelText("Step 1 of 3: World")).toBeNull();
  const consoleError = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});
  try {
    mockCatalog.mockImplementation(() => {
      throw new Error("backend unavailable");
    });
    await view.rerender(<Workshop />);
    expect(view.getByText(/idea shelves could not load/)).toBeTruthy();
    mockCatalog.mockImplementation(() => catalogFixture);
    await fireEvent.press(view.getByText("Retry loading choices"));
    expect(view.getByText("Build a world")).toBeTruthy();
  } finally {
    consoleError.mockRestore();
  }
});

it("browses and shuffles all sixteen choices without creating a story or changing the name", async () => {
  const view = await render(<Workshop />);
  await nameHero(view);
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  expect(view.getAllByRole("radio")).toHaveLength(16);
  await fireEvent.press(view.getByRole("radio", { name: "Friendly alien" }));
  const random = jest.spyOn(Math, "random").mockReturnValue(0);
  try {
    await fireEvent.press(view.getByText("Shuffle"));
    expect(
      view.getByRole("radio", { name: "Scruffy River Otter" }),
    ).toBeChecked();
  } finally {
    random.mockRestore();
  }
  await fireEvent.press(view.getByRole("tab", { name: "Name" }));
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
  expect(mockCreateStory).not.toHaveBeenCalled();
});

it("keeps pinned choices after catalogue publication and submits their original revision", async () => {
  mockCreateStory.mockResolvedValue("pinned_story");
  const view = await render(<Workshop />);
  await packBag(view);
  const original = catalogFixture.options.find(
    (row) => row.key === "hero_otter",
  );
  if (!original) throw new Error("Missing fixture");
  mockCatalog.mockReturnValue({
    ...catalogFixture,
    options: [
      ...catalogFixture.options.filter((row) => row.key !== "hero_otter"),
      { ...original, active: false },
      {
        ...original,
        optionId: "catalog_otter_2",
        revision: 2,
        label: "New otter",
      },
    ],
  });
  await view.rerender(<Workshop />);
  expect(view.getByText(/earlier choices are kept/)).toBeTruthy();
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).toHaveBeenCalledWith(
    expect.objectContaining({ character: fixtureChoice("hero_otter") }),
  );
});

it("requires explicit replacement after withdrawal and lets a retired bag item be removed", async () => {
  const view = await render(<Workshop />);
  await packBag(view);
  mockCatalog.mockReturnValue({
    ...catalogFixture,
    options: catalogFixture.options.map((row) =>
      row.key === "item_whisk"
        ? { ...row, active: false, withdrawn: true }
        : row,
    ),
  });
  await view.rerender(<Workshop />);
  expect(view.getByRole("button", { name: "Start the story" })).toBeDisabled();
  expect(view.getByText(/selected idea is no longer available/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Remove Golden Whisk"));
  await fireEvent.press(
    view.getByRole("checkbox", { name: "Inside-Out Umbrella" }),
  );
  expect(
    view.getByRole("button", { name: "Start the story" }),
  ).not.toBeDisabled();
  expect(mockCreateStory).not.toHaveBeenCalled();
});

it("keeps loaded shelves and choices available offline through a backend remount", async () => {
  const view = await render(<Workshop />);
  await nameHero(view);
  mockCatalog.mockReturnValue(undefined);
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
  });
  await view.rerender(<Workshop clientVersion={1} />);
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  await fireEvent.press(view.getByRole("radio", { name: "Tiny dragon" }));
  expect(view.getByRole("radio", { name: "Tiny dragon" })).toBeChecked();
});

it("applies an explicit Kid Explorer gender only to capable characters and retains it when revisiting", async () => {
  const view = await render(<Workshop />);
  await nameHero(view);
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  await fireEvent.press(
    view.getByRole("radio", { name: "Brave Kid Explorer" }),
  );
  expect(view.getByRole("radio", { name: "Leave open" })).toBeChecked();
  await fireEvent.press(view.getByRole("radio", { name: "Girl" }));
  await fireEvent.press(view.getByLabelText("Step 3 of 3: Backpack"));
  mockCreateStory.mockRejectedValue(new Error("temporary failure"));
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kidGender: "girl",
      character: fixtureChoice("hero_kid"),
    }),
  );
  await fireEvent.press(view.getByLabelText("Step 2 of 3: Hero"));
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  await fireEvent.press(view.getByRole("radio", { name: "Tiny dragon" }));
  await fireEvent.press(view.getByLabelText("Step 3 of 3: Backpack"));
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).toHaveBeenLastCalledWith(
    expect.objectContaining({ kidGender: "open" }),
  );
  await fireEvent.press(view.getByLabelText("Step 2 of 3: Hero"));
  await fireEvent.press(view.getByRole("tab", { name: "Character" }));
  await fireEvent.press(
    view.getByRole("radio", { name: "Brave Kid Explorer" }),
  );
  expect(view.getByRole("radio", { name: "Girl" })).toBeChecked();
});
