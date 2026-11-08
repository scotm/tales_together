import { v } from "convex/values";
import { contextKey } from "../shared/heroIdeas";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { heroContext } from "./lib/catalogValidators";
import { createDiagnostics } from "./lib/diagnostics";
import {
  capabilityHash,
  createCapability,
  digest,
} from "./lib/heroCapabilities";
import { IDEA_TEXT_LIMIT } from "./lib/heroIdeaConfig";
import { interpretIdea } from "./llm/heroInterpretation";
import { moderate } from "./llm/moderation";
import { getTextProvider } from "./llm/provider";

export const openSession = action({
  args: {},
  handler: async (ctx) => {
    const capability = createCapability();
    await ctx.runMutation(internal.heroIdeaState.open, {
      tokenHash: await capabilityHash(capability),
    });
    return { capability, expiresAt: Date.now() + 24 * 60 * 60_000 };
  },
});
export const prepare = action({
  args: {
    capability: v.string(),
    requestId: v.string(),
    context: heroContext,
    text: v.string(),
    source: v.union(v.literal("typed"), v.literal("spoken")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ideaId: import("./_generated/dataModel").Id<"heroIdeas">;
    parts: import("./llm/heroInterpretation").IdeaPart[];
    clarification: string;
    expiresAt: number;
  }> => {
    const text = args.text.trim();
    if (!text || text.length > IDEA_TEXT_LIMIT)
      throw new Error("Describe your idea in 1–500 characters.");
    const tokenHash = await capabilityHash(args.capability);
    const baseFingerprint = await digest(contextKey(args.context));
    const fingerprint = await digest(
      JSON.stringify([text, baseFingerprint, args.source]),
    );
    const { idea, claimed } = await ctx.runMutation(
      internal.heroIdeaState.claim,
      {
        tokenHash,
        requestId: args.requestId,
        fingerprint,
        baseFingerprint,
        kind: "idea",
        source: args.source,
      },
    );
    if (!claimed) {
      if (["READY", "CONFIRMED"].includes(idea.state) && idea.parts)
        return {
          ideaId: idea._id,
          parts: idea.parts,
          clarification: "",
          expiresAt: idea.expiresAt,
        };
      throw new Error(
        "This idea request already ran. Review your saved choices or try a new request.",
      );
    }
    // This trace is unrelated to the private session capability.
    const diagnostics = createDiagnostics(ctx, {
      name: "hero_idea.prepare",
      traceId: createCapability(),
      purpose: "hero_setup",
    });
    await diagnostics.start();
    let rejected = false;
    const active = async () => {
      if (
        !(await ctx.runQuery(internal.heroIdeaState.active, {
          ideaId: idea._id,
        }))
      )
        throw new Error("This idea was cancelled. Your hero is unchanged.");
    };
    try {
      const base = await ctx.runQuery(internal.heroIdeaState.getBase, {
        ideaId: idea._id,
        context: args.context,
      });
      const relevantGender =
        !("kind" in args.context.character) &&
        (await ctx.runQuery(internal.heroIdeaState.characterGender, {
          reference: args.context.character,
        }))
          ? args.context.kidGender
          : "open";
      const [provider, ...model] =
        getTextProvider("structured").name.split(":");
      const progress = (purpose: string) =>
        diagnostics.providerProgress({
          provider,
          model: model.join(":") || undefined,
          purpose,
          business: { onRetry: active },
        });
      const input = await moderate(text, progress("hero_input_moderation"));
      if (!input.ok) {
        rejected = true;
        throw new Error(input.reason);
      }
      await active();
      const result = await interpretIdea(
        text,
        base,
        relevantGender,
        progress("hero_interpretation"),
      );
      await active();
      const output = await moderate(
        JSON.stringify(result),
        progress("hero_output_moderation"),
      );
      if (!output.ok) {
        rejected = true;
        throw new Error(output.reason);
      }
      if (result.clarification) {
        await ctx.runMutation(internal.heroIdeaState.finish, {
          ideaId: idea._id,
          state: "REJECTED",
        });
        await diagnostics.finish("degraded");
        return {
          ideaId: idea._id,
          parts: [],
          clarification: result.clarification,
          expiresAt: idea.expiresAt,
        };
      }
      const saved = await ctx.runMutation(internal.heroIdeaState.finish, {
        ideaId: idea._id,
        state: "READY",
        parts: result.parts,
      });
      if (!saved)
        throw new Error("This idea was cancelled. Your hero is unchanged.");
      await diagnostics.finish("succeeded");
      return { ideaId: idea._id, ...result, expiresAt: idea.expiresAt };
    } catch {
      await ctx.runMutation(internal.heroIdeaState.finish, {
        ideaId: idea._id,
        state: rejected ? "REJECTED" : "FAILED",
      });
      await diagnostics.finish(
        "failed",
        new Error("Hero idea preparation failed."),
      );
      throw new Error(
        rejected
          ? "Let’s try a kind, safe story idea without real personal details."
          : "We couldn’t prepare that idea. Your hero and words are kept; edit or try again.",
      );
    }
  },
});
