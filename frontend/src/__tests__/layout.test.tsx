/// <reference types="jest" />
import { act, fireEvent, render } from "@testing-library/react-native";
import { useFonts } from "expo-font";
import type { ReactNode } from "react";
import RootLayout from "../app/_layout";

let mockClientVersion = 0;
const mockRecord = jest.fn();
jest.mock("expo-font", () => ({ useFonts: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("expo-router", () => ({
  Stack: function Stack() {
    const { Text, TextInput, View } = require("react-native");
    const { useSetupSession } = require("@/features/setup/SetupProvider");
    const { defaultsFixture } = require("./fixtures/workshopCatalog");
    const { useEffect } = require("react");
    const { draft, dispatch } = useSetupSession();
    useEffect(() => {
      dispatch({ type: "initialize", defaults: defaultsFixture });
    }, [dispatch]);
    return (
      <View>
        <Text>Workshop routes</Text>
        <TextInput
          accessibilityLabel="Draft name"
          value={draft?.heroName ?? ""}
          onChangeText={(value: string) =>
            dispatch({ type: "setHeroName", value })
          }
        />
      </View>
    );
  },
}));
jest.mock("@/lib/BackendProvider", () => {
  const { View } = require("react-native");
  return {
    BackendProvider: ({ children }: { children: ReactNode }) => (
      <View key={mockClientVersion}>{children}</View>
    ),
  };
});
jest.mock("@/lib/diagnostics/ConnectionMonitor", () => ({
  ConnectionMonitor: () => null,
}));
jest.mock("@/lib/diagnostics/DiagnosticsProvider", () => ({
  DiagnosticsProvider: ({ children }: { children: ReactNode }) => children,
  useDiagnostics: () => ({ record: mockRecord }),
}));
jest.mock("@/lib/diagnostics/ErrorBoundary", () => ({
  DiagnosticsErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockClientVersion = 0;
  jest.mocked(useFonts).mockReturnValue([true, null]);
});
afterEach(() => jest.useRealTimers());

it("keeps the unfinished draft when the backend subtree remounts", async () => {
  const view = await render(<RootLayout />);
  await fireEvent.changeText(view.getByLabelText("Draft name"), "Mira");
  mockClientVersion = 1;
  await view.rerender(<RootLayout />);
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
});

it("opens the app after the bounded wait when font loading never settles", async () => {
  jest.mocked(useFonts).mockReturnValue([false, null]);
  const view = await render(<RootLayout />);
  expect(view.queryByText("Workshop routes")).toBeNull();
  await act(() => jest.advanceTimersByTime(2_500));
  expect(view.getByText("Workshop routes")).toBeTruthy();
});

it("opens the app on a font failure and reports it once without the raw error", async () => {
  jest
    .mocked(useFonts)
    .mockReturnValue([false, new Error("private asset location")]);
  const view = await render(<RootLayout />);
  expect(view.getByText("Workshop routes")).toBeTruthy();
  await view.rerender(<RootLayout />);
  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledWith(
    "app.fonts_failed",
    expect.objectContaining({
      message: "Workshop fonts failed to load; using system fonts.",
    }),
  );
});
