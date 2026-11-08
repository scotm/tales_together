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

/** Private custom parts become durable snapshots only after explicit confirmation. */
export async function resolveHeroChoice(
  ctx: Pick<QueryCtx, "db">,
  reference: import("convex/values").Infer<
    typeof import("./catalogValidators").heroReference
  >,
  part: "character" | "outfit" | "quirk" | "details",
  sessionId?: import("../_generated/dataModel").Id<"heroIdeaSessions">,
) {
  if (!("kind" in reference)) {
    if (part === "details") throw new Error("Choose a custom detail.");
    const row = await resolveChoice(ctx, reference, part);
    return {
      snapshot: snapshot(row),
      supportsGender: row.supportsGender ?? false,
    };
  }
  const idea = await ctx.db.get(reference.ideaId);
  if (
    !sessionId ||
    !idea ||
    idea.sessionId !== sessionId ||
    idea.state !== "CONFIRMED" ||
    idea.expiresAt <= Date.now() ||
    reference.part !== part ||
    !idea.confirmedText
  ) {
    throw new Error(
      "This custom idea expired or is unavailable. Review it again; your other choices are kept.",
    );
  }
  const value = idea.parts?.find((entry) => entry.part === part);
  if (!value) throw new Error("This idea does not contain that hero part.");
  return {
    supportsGender: false,
    snapshot: {
      kind: "custom" as const,
      ideaId: idea._id,
      part,
      label: value.label,
      displayLabel: value.label,
      description: value.description,
      source: idea.source,
      interpretationVersion: idea.interpretationVersion ?? "v1",
      confirmedText: idea.confirmedText,
    },
  };
}
