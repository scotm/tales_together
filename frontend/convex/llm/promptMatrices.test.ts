import { describe, expect, it } from "vitest";
import { getArcRoleInstructions } from "./promptMatrices";

describe("arc roles", () => {
  it("maps five chapters to hook, rising, climax, resolution", () => {
    const roles = [1, 2, 3, 4, 5].map(
      (index) => getArcRoleInstructions(index, 5).role,
    );

    expect(roles).toEqual([
      "HOOK_AND_INCITING_INCIDENT",
      "RISING_ACTION_COMPLICATION_2",
      "RISING_ACTION_COMPLICATION_3",
      "CLIMAX_AND_ALL_HOPE_IS_LOST",
      "RESOLUTION_AND_CELEBRATION",
    ]);
  });

  it("refuses a book shorter than three chapters", () => {
    expect(() => getArcRoleInstructions(1, 2)).toThrow(/at least 3/);
  });
});
