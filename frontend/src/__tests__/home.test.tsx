/// <reference types="jest" />
import { act, fireEvent, render } from "@testing-library/react-native";
import { useConvexConnectionState, useQuery } from "convex/react";
import HomeScreen from "../app/index";

const mockReconnect = jest.fn();
const mockCreateStory = jest.fn();
const mockClient = {
  url: "http://192.168.50.176:3210",
  connectionState: () => ({}),
};
jest.mock("@/lib/BackendProvider", () => ({
  useReconnectBackend: () => mockReconnect,
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("convex/react", () => ({
  useQuery: jest.fn(),
  useMutation: () => mockCreateStory,
  useConvex: () => mockClient,
  useConvexConnectionState: jest.fn(),
}));

const connected = {
  isWebSocketConnected: true,
  inflightMutations: 0,
  inflightActions: 0,
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(useQuery).mockReturnValue(undefined);
  (useConvexConnectionState as jest.Mock).mockReturnValue(connected);
});
afterEach(() => jest.useRealTimers());

it("replaces an unresolved spinner with a retry and recovers without losing choices", async () => {
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
  });
  const view = await render(<HomeScreen />);
  await fireEvent.changeText(view.getByPlaceholderText("Hero name"), "Mira");
  expect(view.getByLabelText("Loading recent stories")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.queryByLabelText("Loading recent stories")).toBeNull();
  expect(view.getByText(/Cannot connect to the story server/)).toBeTruthy();
  expect(view.getByText(/192.168.50.176:3210/)).toBeTruthy();
  await fireEvent.press(view.getByText("Start the story"));
  expect(mockCreateStory).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Try connecting again"));
  expect(mockReconnect).toHaveBeenCalledTimes(1);

  (useConvexConnectionState as jest.Mock).mockReturnValue(connected);
  jest.mocked(useQuery).mockReturnValue([]);
  await view.rerender(<HomeScreen />);
  expect(view.getByText("No stories yet. Make the first one.")).toBeTruthy();
  expect(view.queryByText(/Cannot connect/)).toBeNull();
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
});

it("reports a stalled query even when its socket is connected", async () => {
  const view = await render(<HomeScreen />);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.getByText(/taking too long to respond/)).toBeTruthy();
});

it("keeps cached stories visible but prevents retry from discarding a queued write", async () => {
  jest.mocked(useQuery).mockReturnValue([
    {
      _id: "story_1",
      title: "The Windy Kite",
      totalChapters: 5,
      readingLevel: "AGES_7_9",
    },
  ]);
  (useConvexConnectionState as jest.Mock).mockReturnValue({
    ...connected,
    isWebSocketConnected: false,
    inflightMutations: 1,
  });
  const view = await render(<HomeScreen />);
  await act(() => jest.advanceTimersByTime(10_000));
  expect(view.getByText("The Windy Kite")).toBeTruthy();
  expect(view.queryByText("Try connecting again")).toBeNull();
  expect(view.getByText(/Waiting for your pending request/)).toBeTruthy();
});
