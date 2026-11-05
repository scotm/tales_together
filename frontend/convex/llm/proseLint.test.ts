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
      `Mira ran ${Array.from({ length: 30 }, () => "very").join(" ")} fast.`,
    ]);
    expect(verdict).toEqual({
      ok: false,
      reason: expect.stringMatching(/sentence is 33 words \(max 28\)/),
    });
  });

  it("does not glue a quoted sentence onto the next one", () => {
    const quote = [
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "thirteen",
      "fourteen",
      "fifteen",
      "sixteen",
      "seventeen",
      "eighteen",
    ].join(" ");

    expect(lintProse([`Mira said, “${quote}.” Then she ran.`])).toEqual({
      ok: true,
    });
  });

  it("keeps the prompt and the lint on the same banned list", () => {
    for (const phrase of BANNED_PHRASES) {
      expect(GLOBAL_WRITING_RULES).toContain(`"${phrase}"`);
    }
  });
});
