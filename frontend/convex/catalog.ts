import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { catalogContent } from "./lib/catalogValidators";

export const BACKPACK_SIZE = 3;

/** Public display data only. Pinned retired revisions remain usable unless withdrawn. */
export const listChoices = query({
  args: { pinned: v.optional(v.array(v.id("catalogOptions"))) },
  handler: async (ctx, { pinned = [] }) => {
    if (pinned.length > 12) throw new Error("Too many pinned choices.");
    const active = await ctx.db
      .query("catalogOptions")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const rows = new Map(active.map((row) => [row._id, row]));
    for (const id of pinned) {
      const row = await ctx.db.get(id);
      if (row) rows.set(id, row);
    }
    return {
      backpackSize: BACKPACK_SIZE,
      options: await Promise.all(
        [...rows.values()]
          .sort(
            (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
          )
          .map(async (row) => ({
            optionId: row._id,
            key: row.key,
            category: row.category,
            revision: row.revision,
            active: row.active,
            withdrawn: row.withdrawnAt !== undefined,
            sortOrder: row.sortOrder,
            label: row.label,
            displayLabel: row.displayLabel,
            assetKey: row.assetKey,
            previewLayout: row.previewLayout,
            previewUrl: row.previewFileId
              ? await ctx.storage.getUrl(row.previewFileId)
              : null,
            isDefault: row.isDefault,
            supportsGender: row.supportsGender ?? false,
          })),
      ),
    };
  },
});

/** Admin-only publishing is atomic; an expected revision prevents lost updates. */
export const publish = internalMutation({
  args: { ...catalogContent, expectedRevision: v.number() },
  handler: async (ctx, { expectedRevision, ...content }) => {
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(content.key))
      throw new Error("Invalid catalogue key.");
    for (const value of [
      content.label,
      content.displayLabel,
      content.promptFragment,
    ]) {
      if (!value.trim() || value.length > 2000)
        throw new Error("Invalid catalogue text.");
    }
    if (!Number.isFinite(content.sortOrder))
      throw new Error("Invalid catalogue order.");
    if (content.category === "problem" && !content.titleSuffix?.trim()) {
      throw new Error("A problem needs a title suffix.");
    }
    if (content.category !== "problem" && content.titleSuffix !== undefined) {
      throw new Error("Only problems have title suffixes.");
    }
    if (content.supportsGender && content.category !== "character") {
      throw new Error("Only characters can support gender.");
    }
    if (content.previewFileId) {
      const file = await ctx.db.system.get(content.previewFileId);
      if (!file) throw new Error("Preview file not found.");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(
          file.contentType ?? "",
        ) ||
        file.size > 5 * 1024 * 1024
      ) {
        throw new Error(
          "Previews must be PNG, JPEG or WebP images up to 5 MiB.",
        );
      }
    }
    const previous = await ctx.db
      .query("catalogOptions")
      .withIndex("by_key_revision", (q) => q.eq("key", content.key))
      .order("desc")
      .collect();
    const latest = previous[0];
    if ((latest?.revision ?? 0) !== expectedRevision)
      throw new Error("Catalogue revision changed. Reload before publishing.");
    if (latest && latest.category !== content.category)
      throw new Error("A stable key cannot change category.");
    if (content.isDefault && content.category !== "item") {
      const defaults = await ctx.db
        .query("catalogOptions")
        .withIndex("by_category_active_order", (q) =>
          q.eq("category", content.category).eq("active", true),
        )
        .collect();
      if (defaults.some((row) => row.isDefault && row.key !== content.key)) {
        throw new Error("Another default already exists in this category.");
      }
    }
    const now = Date.now();
    for (const row of previous.filter((row) => row.active)) {
      await ctx.db.patch(row._id, { active: false, retiredAt: now });
    }
    return await ctx.db.insert("catalogOptions", {
      ...content,
      revision: expectedRevision + 1,
      active: true,
      createdAt: now,
    });
  },
});

/** Safety withdrawal invalidates a pinned revision; ordinary retirement does not. */
export const withdraw = internalMutation({
  args: { optionId: v.id("catalogOptions") },
  handler: async (ctx, { optionId }) => {
    const row = await ctx.db.get(optionId);
    if (!row) throw new Error("Catalogue choice not found.");
    await ctx.db.patch(optionId, {
      active: false,
      withdrawnAt: row.withdrawnAt ?? Date.now(),
      retiredAt: row.retiredAt ?? Date.now(),
    });
  },
});
