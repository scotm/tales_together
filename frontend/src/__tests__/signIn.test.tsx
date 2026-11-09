/// <reference types="jest" />
import { fireEvent, render } from "@testing-library/react-native";
import { useConvexAuth } from "convex/react";
import { Text } from "react-native";
import { RequireSignIn } from "@/features/auth/RequireSignIn";

const mockSignIn = {
  status: "needs_identifier",
  emailCode: { sendCode: jest.fn(), verifyCode: jest.fn() },
  finalize: jest.fn(),
  reset: jest.fn(),
};
jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({ signIn: mockSignIn, fetchStatus: "idle" }),
  isClerkAPIResponseError: (error: { errors?: unknown }) =>
    Array.isArray(error?.errors),
}));
jest.mock("convex/react", () => ({ useConvexAuth: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);

function clerkError(code: string, status = 422) {
  return { status, errors: [{ code, message: code, longMessage: code }] };
}

function signedOut() {
  jest.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isAuthenticated: false,
    isRefreshing: false,
  });
}

async function renderGate() {
  return await render(
    <RequireSignIn>
      <Text>The workshop</Text>
    </RequireSignIn>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = "needs_identifier";
  mockSignIn.emailCode.sendCode.mockResolvedValue({ error: null });
  mockSignIn.emailCode.verifyCode.mockImplementation(async () => {
    mockSignIn.status = "complete";
    return { error: null };
  });
  mockSignIn.finalize.mockResolvedValue({ error: null });
  mockSignIn.reset.mockResolvedValue({ error: null });
});

it("shows the screen only to a signed-in guest", async () => {
  jest.mocked(useConvexAuth).mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    isRefreshing: false,
  });
  const view = await renderGate();
  expect(view.getByText("The workshop")).toBeTruthy();
});

it("waits quietly while the saved sign-in is checked", async () => {
  jest.mocked(useConvexAuth).mockReturnValue({
    isLoading: true,
    isAuthenticated: false,
    isRefreshing: false,
  });
  const view = await renderGate();
  expect(view.getByLabelText("Checking your sign-in")).toBeTruthy();
  expect(view.queryByText("The workshop")).toBeNull();
  expect(view.queryByLabelText("Email address")).toBeNull();
});

it("signs a guest in with an emailed code", async () => {
  signedOut();
  const view = await renderGate();
  expect(view.queryByText("The workshop")).toBeNull();
  await fireEvent.changeText(
    view.getByLabelText("Email address"),
    "  gran@example.com ",
  );
  await fireEvent.press(view.getByText("Email me a code"));
  expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({
    emailAddress: "gran@example.com",
  });
  expect(view.getByText(/We sent a code to gran@example.com/)).toBeTruthy();

  const code = view.getByLabelText("Six-digit code");
  await fireEvent.changeText(code, "42-42 42");
  expect(view.getByDisplayValue("424242")).toBeTruthy();
  await fireEvent.press(view.getByText("Sign in"));
  expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledWith({
    code: "424242",
  });
  expect(mockSignIn.finalize).toHaveBeenCalledTimes(1);
});

it("checks the email locally and explains an uninvited address", async () => {
  signedOut();
  const view = await renderGate();
  await fireEvent.changeText(view.getByLabelText("Email address"), "gran");
  await fireEvent.press(view.getByText("Email me a code"));
  expect(
    view.getByText("Enter the email address you were invited with."),
  ).toBeTruthy();
  expect(mockSignIn.emailCode.sendCode).not.toHaveBeenCalled();

  mockSignIn.emailCode.sendCode.mockResolvedValueOnce({
    error: clerkError("form_identifier_not_found"),
  });
  await fireEvent.changeText(
    view.getByLabelText("Email address"),
    "stranger@example.com",
  );
  await fireEvent.press(view.getByText("Email me a code"));
  expect(view.getByText(/isn’t on the guest list yet/)).toBeTruthy();
  expect(view.queryByLabelText("Six-digit code")).toBeNull();
});

it("explains a wrong code and lets the guest start again", async () => {
  signedOut();
  mockSignIn.emailCode.verifyCode.mockResolvedValueOnce({
    error: clerkError("form_code_incorrect"),
  });
  const view = await renderGate();
  await fireEvent.changeText(
    view.getByLabelText("Email address"),
    "gran@example.com",
  );
  await fireEvent.press(view.getByText("Email me a code"));
  await fireEvent.changeText(view.getByLabelText("Six-digit code"), "111111");
  await fireEvent.press(view.getByText("Sign in"));
  expect(view.getByText(/doesn’t match/)).toBeTruthy();
  expect(mockSignIn.finalize).not.toHaveBeenCalled();

  await fireEvent.press(view.getByText("Use a different email"));
  expect(mockSignIn.reset).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText("Email address")).toBeTruthy();
});

it("tells the guest to wait when Clerk rate-limits them", async () => {
  signedOut();
  mockSignIn.emailCode.sendCode.mockResolvedValueOnce({
    error: clerkError("too_many_requests", 429),
  });
  const view = await renderGate();
  await fireEvent.changeText(
    view.getByLabelText("Email address"),
    "gran@example.com",
  );
  await fireEvent.press(view.getByText("Email me a code"));
  expect(view.getByText(/Too many tries/)).toBeTruthy();
});
