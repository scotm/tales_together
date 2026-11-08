import {
  drawingPhrases,
  nextPhrase,
  writingPhrases,
} from "@/lib/loadingPhrases";

describe("loading phrases", () => {
  it("ships one hundred different phrases for each job", () => {
    for (const phrases of [writingPhrases, drawingPhrases]) {
      expect(phrases).toHaveLength(100);
      expect(new Set(phrases).size).toBe(100);
    }
  });

  it("never repeats the phrase already on screen", () => {
    const phrases = ["a", "b", "c"];
    for (const previous of phrases) {
      for (let i = 0; i < 50; i++) {
        const phrase = nextPhrase(phrases, previous);
        expect(phrases).toContain(phrase);
        expect(phrase).not.toBe(previous);
      }
    }
  });

  it("returns the only phrase when there is nothing to rotate to", () => {
    expect(nextPhrase(["only"], "only")).toBe("only");
  });
});
