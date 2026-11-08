import { describe, expect, it } from "vitest";
import { WORLD_PROBLEMS } from "./fixtures/legacyCatalog";

describe("problem titles", () => {
  it("finishes '<hero> and …' without repeating an article", () => {
    for (const problem of WORLD_PROBLEMS) {
      const title = `Ziggy and ${problem.titleSuffix}`;
      expect(problem.titleSuffix).toMatch(/^the /);
      expect(title).not.toMatch(/\bthe (the|a|an)\b/i);
    }
  });

  it("names each problem differently", () => {
    const suffixes = WORLD_PROBLEMS.map((problem) => problem.titleSuffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
