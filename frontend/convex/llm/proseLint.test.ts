import { describe, expect, it } from "vitest";
import { GLOBAL_WRITING_RULES } from "./prompts";
import { BANNED_PHRASES, lintProse } from "./proseLint";

describe("prose lint", () => {
  it("passes prose a seven-year-old can read", () => {
    expect(
      lintProse([
        "Mira held the string tight. The kite pulled like a dog on a walk.",
        '"Not yet!" she shouted.',
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects a banned cliché regardless of case", () => {
    const verdict = lintProse(["The kite rose into a Shimmering sky."]);
    expect(verdict).toEqual({
      ok: false,
      reason: 'banned phrase "shimmering"',
    });
  });

  it("rejects a sentence over the length limit", () => {
    const verdict = lintProse([
      `Mira ran ${Array.from({ length: 25 }, () => "very").join(" ")} fast.`,
    ]);
    expect(verdict).toEqual({
      ok: false,
      reason: expect.stringMatching(/sentence is 28 words \(max 22\)/),
    });
  });

  it("keeps the prompt and the lint on the same banned list", () => {
    for (const phrase of BANNED_PHRASES) {
      expect(GLOBAL_WRITING_RULES).toContain(`"${phrase}"`);
    }
  });
});
