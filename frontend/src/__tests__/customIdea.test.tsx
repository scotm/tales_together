/// <reference types="jest" />
import { act, fireEvent, render } from "@testing-library/react-native";
import { useAction, useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CustomIdeaEditor } from "@/features/setup/CustomIdeaEditor";
import { catalogChoice } from "@/features/setup/catalog";
import { SetupProvider, useSetupDraft } from "@/features/setup/SetupProvider";
import { startRecording } from "@/lib/voice/recording";
import { catalogFixture, defaultsFixture } from "./fixtures/workshopCatalog";

const mockFocus = jest.fn();
const mockOpen = jest.fn();
const mockPrepare = jest.fn();
const mockTranscribe = jest.fn();
const mockConfirm = jest.fn();
const mockCancelRequest = jest.fn();
const mockStop = jest.fn();
const mockCancelRecording = jest.fn();
let mockConnected = true;
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => () => void) => mockFocus(callback),
}));
jest.mock("@/lib/voice/recording", () => ({ startRecording: jest.fn() }));
jest.mock("convex/react", () => ({
  useAction: jest.fn(),
  useMutation: jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockConnected }),
}));
const parts = [
  { part: "outfit", label: "Blue cape", description: "wearing a blue cape" },
  {
    part: "details",
    label: "Rainbow glasses",
    description: "wearing rainbow glasses",
  },
  {
    part: "quirk",
    label: "Star hiccups",
    description: "Hiccups harmless stars",
  },
];
function Inner() {
  const { draft, dispatch } = useSetupDraft();
  const [open, setOpen] = useState(true);
  const dragon = catalogFixture.options.find(
    (row) => row.key === "hero_dragon",
  );
  return (
    <View>
      <Text testID="hero-summary">
        {draft.character.key} | {draft.outfit.kind} |{" "}
        {draft.details?.description ?? "no detail"} | {draft.quirk.kind}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change the base"
        onPress={() => {
          if (dragon)
            dispatch({
              type: "selectHero",
              part: "character",
              choice: catalogChoice(dragon),
            });
        }}
      >
        <Text>Change the base</Text>
      </Pressable>
      {open ? <CustomIdeaEditor onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
function Editor() {
  return (
    <SetupProvider defaults={defaultsFixture ?? undefined}>
      <Inner />
    </SetupProvider>
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockConnected = true;
  mockOpen.mockReset().mockResolvedValue({
    capability: "a".repeat(64),
    expiresAt: Date.now() + 86_400_000,
  });
  mockPrepare.mockReset().mockResolvedValue({
    ideaId: "idea_one",
    parts,
    clarification: "",
    expiresAt: Date.now() + 86_400_000,
  });
  mockTranscribe
    .mockReset()
    .mockResolvedValue("An otter with rainbow glasses.");
  mockConfirm.mockReset().mockResolvedValue(parts);
  mockCancelRequest.mockReset().mockResolvedValue(undefined);
  mockStop
    .mockReset()
    .mockResolvedValue({ audio: new ArrayBuffer(44), mimeType: "audio/wav" });
  mockCancelRecording.mockReset().mockResolvedValue(undefined);
  jest
    .mocked(startRecording)
    .mockResolvedValue({ stop: mockStop, cancel: mockCancelRecording });
  (useAction as jest.Mock).mockImplementation(
    (fn: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(fn);
      return name === "heroIdeas:openSession"
        ? mockOpen
        : name === "speech:transcribe"
          ? mockTranscribe
          : mockPrepare;
    },
  );
  (useMutation as jest.Mock).mockImplementation(
    (fn: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(fn) === "heroIdeaState:confirm"
        ? mockConfirm
        : mockCancelRequest,
  );
});
afterEach(() => jest.useRealTimers());
it("reviews several custom parts and applies only after explicit confirmation", async () => {
  const view = await render(<Editor />);
  await fireEvent.changeText(
    view.getByLabelText("Your idea"),
    "A blue cape, rainbow glasses and star hiccups.",
  );
  await fireEvent.press(view.getByText("Review my idea"));
  expect(view.getByText("Here is what your hero will have")).toBeTruthy();
  expect(view.getByTestId("hero-summary")).toHaveTextContent(
    "hero_otter | catalog | no detail | catalog",
  );
  expect(mockConfirm).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Use this idea"));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(view.getByTestId("hero-summary")).toHaveTextContent(
    "hero_otter | custom | wearing rainbow glasses | custom",
  );
  expect(view.queryByLabelText("Your idea")).toBeNull();
});
it("retains words and the hero on rejection, and invalidates the proposal when words change", async () => {
  const view = await render(<Editor />);
  await fireEvent.changeText(view.getByLabelText("Your idea"), "A blue cape");
  mockPrepare.mockRejectedValueOnce(new Error("Please try a safe idea."));
  await fireEvent.press(view.getByText("Review my idea"));
  expect(view.getByDisplayValue("A blue cape")).toBeTruthy();
  expect(view.getByText("Please try a safe idea.")).toBeTruthy();
  await fireEvent.press(view.getByText("Review my idea"));
  await fireEvent.changeText(view.getByLabelText("Your idea"), "A purple cape");
  expect(view.queryByText("Use this idea")).toBeNull();
  expect(mockConfirm).not.toHaveBeenCalled();
});
it("ignores a cancelled late interpretation and keeps the original hero", async () => {
  let finish!: (value: unknown) => void;
  mockPrepare.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(<Editor />);
  await fireEvent.changeText(view.getByLabelText("Your idea"), "A blue cape");
  await fireEvent.press(view.getByText("Review my idea"));
  await fireEvent.press(view.getByText("Cancel this request"));
  await act(() => finish({ ideaId: "late", parts, clarification: "" }));
  expect(view.queryByText("Use this idea")).toBeNull();
  expect(view.getByTestId("hero-summary")).toHaveTextContent(
    "hero_otter | catalog | no detail | catalog",
  );
  expect(mockCancelRequest).toHaveBeenCalled();
});
it("rejects a proposal whose base changes, including while confirmation is pending", async () => {
  let finish!: (value: unknown) => void;
  mockConfirm.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(<Editor />);
  await fireEvent.changeText(view.getByLabelText("Your idea"), "A blue cape");
  await fireEvent.press(view.getByText("Review my idea"));
  await fireEvent.press(view.getByText("Use this idea"));
  await fireEvent.press(view.getByText("Change the base"));
  await act(() => finish(parts));
  expect(
    view.getByText("Your hero changed. Review the idea again."),
  ).toBeTruthy();
  expect(view.getByTestId("hero-summary")).toHaveTextContent(
    "hero_dragon | catalog | no detail | catalog",
  );
});
it("records only on request, transcribes to editable text and requires a separate review", async () => {
  const view = await render(<Editor />);
  expect(startRecording).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Speak your idea"));
  expect(view.getByText("Stop recording")).toBeTruthy();
  await fireEvent.press(view.getByText("Stop recording"));
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(view.getByDisplayValue("An otter with rainbow glasses.")).toBeTruthy();
  expect(mockPrepare).not.toHaveBeenCalled();
  await fireEvent.changeText(
    view.getByLabelText("Your idea"),
    "An otter with blue glasses.",
  );
  await fireEvent.press(view.getByText("Review my idea"));
  expect(mockPrepare).toHaveBeenCalledWith(
    expect.objectContaining({
      text: "An otter with blue glasses.",
      source: "spoken",
    }),
  );
});
it("stops recording at twenty seconds, releases it on cancellation and keeps typing available after denial", async () => {
  const view = await render(<Editor />);
  await fireEvent.press(view.getByText("Speak your idea"));
  await act(() => jest.advanceTimersByTimeAsync(20_000));
  expect(mockStop).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByText("Speak your idea"));
  await fireEvent.press(view.getByText("Cancel this request"));
  expect(mockCancelRecording).toHaveBeenCalledTimes(1);
  jest
    .mocked(startRecording)
    .mockRejectedValueOnce(new Error("Microphone denied. Type instead."));
  await fireEvent.press(view.getByText("Speak your idea"));
  expect(view.getByText("Microphone denied. Type instead.")).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText("Your idea"),
    "A purple dragon",
  );
  expect(view.getByDisplayValue("A purple dragon")).toBeTruthy();
});
it("blocks paid requests offline without clearing editable words", async () => {
  mockConnected = false;
  const view = await render(<Editor />);
  await fireEvent.changeText(view.getByLabelText("Your idea"), "A blue cape");
  expect(view.getByRole("button", { name: "Review my idea" })).toBeDisabled();
  expect(view.getByRole("button", { name: "Speak your idea" })).toBeDisabled();
  expect(mockOpen).not.toHaveBeenCalled();
});

it("stops capture when route focus is lost, even if Expo keeps the screen mounted", async () => {
  const view = await render(<Editor />);
  await fireEvent.press(view.getByText("Speak your idea"));
  const onBlur = mockFocus.mock.calls.at(-1)?.[0]();
  await act(() => {
    onBlur?.();
  });
  expect(mockCancelRecording).toHaveBeenCalledTimes(1);
  expect(view.queryByText("Stop recording")).toBeNull();
  expect(view.getByLabelText("Your idea")).toBeTruthy();
});
