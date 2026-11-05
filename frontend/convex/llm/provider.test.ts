import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  getTextProvider,
  type TextRequest,
} from "./provider";

describe("fake provider", () => {
  it("replays replies in order and records every request", async () => {
    const { provider, calls } = createFakeProvider(["one", "two"]);
    const request: TextRequest = { system: "sys", user: "usr" };

    await expect(provider.complete(request)).resolves.toBe("one");
    await expect(provider.complete(request)).resolves.toBe("two");

    expect(provider.name).toBe("fake");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.request.user).toBe("usr");
  });

  it("throws when replies run out instead of returning empty text", async () => {
    const { provider } = createFakeProvider([]);

    await expect(
      provider.complete({ system: "sys", user: "usr" }),
    ).rejects.toThrow(/ran out of replies/);
  });
});

describe("real provider", () => {
  it("fails loudly when the deployment has no key", () => {
    expect(() => getTextProvider()).toThrow(/GEMINI_API_KEY/);
  });
});
