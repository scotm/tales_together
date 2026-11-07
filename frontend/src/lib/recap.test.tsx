import { recapSentence } from "./recap";

describe("recapSentence", () => {
  it("strips the model's own preamble", () => {
    expect(recapSentence("Previously, Ziggy found a giggling map.")).toBe(
      "Ziggy found a giggling map.",
    );
    expect(recapSentence("Previously on the cake: it flew away.")).toBe(
      "the cake: it flew away.",
    );
  });

  it("leaves a bare sentence alone", () => {
    expect(recapSentence("The cake grew wings.")).toBe("The cake grew wings.");
  });
});
