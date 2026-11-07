/// <reference types="jest" />
import { fireEvent, render } from "@testing-library/react-native";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Button, Text, TextInput } from "react-native";
import { BackendProvider, useReconnectBackend } from "./BackendProvider";
import { convex, createConvexClient } from "./convex";

jest.mock("./convex", () => ({
  convex: {
    url: "http://old:3210",
    close: jest.fn(async () => {}),
    connectionState: jest.fn(),
  },
  createConvexClient: jest.fn(),
}));

function Form() {
  const [name, setName] = useState("Barnaby");
  const client = useConvex();
  const reconnect = useReconnectBackend();
  return (
    <>
      <TextInput
        accessibilityLabel="Hero"
        value={name}
        onChangeText={setName}
      />
      <Text>{client.url}</Text>
      <Button title="Reconnect" onPress={reconnect} />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (convex.connectionState as jest.Mock).mockReturnValue({
    inflightMutations: 0,
    inflightActions: 0,
  });
  (createConvexClient as jest.Mock).mockReturnValue({ url: "http://new:3210" });
});

it("replaces the socket client without remounting the form", async () => {
  const view = await render(
    <BackendProvider>
      <Form />
    </BackendProvider>,
  );
  await fireEvent.changeText(view.getByLabelText("Hero"), "Mira");
  await fireEvent.press(view.getByText("Reconnect"));
  expect(convex.close).toHaveBeenCalledTimes(1);
  expect(view.getByText("http://new:3210")).toBeTruthy();
  expect(view.getByDisplayValue("Mira")).toBeTruthy();
});

it.each(["inflightMutations", "inflightActions"])(
  "preserves queued requests when %s is nonzero",
  async (field) => {
    (convex.connectionState as jest.Mock).mockReturnValue({ [field]: 1 });
    const view = await render(
      <BackendProvider>
        <Form />
      </BackendProvider>,
    );
    await fireEvent.press(view.getByText("Reconnect"));
    expect(convex.close).not.toHaveBeenCalled();
    expect(createConvexClient).not.toHaveBeenCalled();
  },
);
