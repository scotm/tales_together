import { afterEach, expect, test, vi } from "vitest";
import { parseInterpretation } from "./heroInterpretation";
import { moderate } from "./moderation";
import { createFakeProvider, getTextProvider } from "./provider";

vi.mock("./provider", async (original) => ({
  ...(await original<typeof import("./provider")>()),
  getTextProvider: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());
test("rejects invented fields, duplicate parts and overlong descriptions", () => {
  const part = {
    part: "outfit",
    label: "Cape",
    description: "wearing a blue cape",
  };
  for (const value of [
    { parts: [part], clarification: "", name: "invented" },
    { parts: [part, part], clarification: "" },
    { parts: [{ ...part, description: "x".repeat(501) }], clarification: "" },
    { parts: [{ ...part, part: "gender" }], clarification: "" },
  ])
    expect(() => parseInterpretation(JSON.stringify(value))).toThrow(
      /couldn’t understand/,
    );
});
test("moderation fails closed on malformed or extra output fields and keeps its API schema compatible", async () => {
  const fake = createFakeProvider([
    '{"safe":true,"extra":"untrusted"}',
    "not JSON",
    '{"safe":false}',
    '{"safe":true}',
  ]);
  vi.mocked(getTextProvider).mockReturnValue(fake.provider);
  expect((await moderate("A blue cape")).ok).toBe(false);
  expect((await moderate("A blue cape")).ok).toBe(false);
  expect((await moderate("A blue cape")).ok).toBe(false);
  expect((await moderate("A blue cape")).ok).toBe(true);
  expect(JSON.stringify(fake.calls[0]?.request.jsonSchema)).not.toContain(
    "additionalProperties",
  );
  expect(fake.calls[0]?.request.system).not.toContain("A blue cape");
});
