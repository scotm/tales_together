import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { catalogCategory, catalogReference } from "./catalogValidators";

export function snapshot(row: Doc<"catalogOptions">) {
  return {
    kind: "catalog" as const,
    optionId: row._id,
    key: row.key,
    revision: row.revision,
    label: row.label,
    displayLabel: row.displayLabel,
    description: row.promptFragment,
    ...(row.assetKey ? { assetKey: row.assetKey } : {}),
  };
}

export async function resolveChoice(
  ctx: Pick<QueryCtx, "db">,
  reference: Infer<typeof catalogReference>,
  category: Infer<typeof catalogCategory>,
) {
  const row = await ctx.db.get(reference.optionId);
  if (
    !row ||
    row.category !== category ||
    row.revision !== reference.revision
  ) {
    throw new Error(
      "A catalogue choice is unavailable. Please choose it again.",
    );
  }
  if (row.withdrawnAt !== undefined) {
    throw new Error(
      "A choice was withdrawn. Please replace it before starting.",
    );
  }
  return row;
}
