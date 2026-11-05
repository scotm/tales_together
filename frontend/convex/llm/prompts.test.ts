import { describe, expect, it } from "vitest";
import { type ChapterProseInput, chapterProsePrompt } from "./prompts";

function promptFor(chapterIndex: number) {
  const input: ChapterProseInput = {
    storyTitle: "The Windy Kite",
    chapterIndex,
    totalChapters: 5,
    arc: { role: "TEST_ROLE", instructions: "Do the test thing." },
    setting: "A seaside town",
    vibe: "SILLY_ADVENTURE",
    characters: [],
    availableItems: [],
    unresolvedThreads: [],
    priorChapters: [],
    chosenBeat: { title: "Wind Race!", kidFriendlyPitch: "Run!" },
    endingStyle: "CLIFFHANGER",
  };
  return chapterProsePrompt(input).system;
}

describe("chapter prose prompt", () => {
  it("states whether this is the final chapter instead of naming an undefined flag", () => {
    expect(promptFor(1)).toContain("NOT the final chapter");
    expect(promptFor(5)).toContain("the FINAL chapter");
    expect(promptFor(1)).not.toContain("isFinalChapter");
  });
});
