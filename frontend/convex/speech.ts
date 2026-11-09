"use node";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireMember } from "./lib/access";
import { GEMINI_FAST_MODEL } from "./lib/config";
import { createDiagnostics } from "./lib/diagnostics";
import {
  capabilityHash,
  createCapability,
  digest,
} from "./lib/heroCapabilities";
import { transcribeAudio } from "./speech/transcribe";
import { validateAudio } from "./speech/validateAudio";

export const transcribe = action({
  args: {
    capability: v.string(),
    requestId: v.string(),
    audio: v.bytes(),
    mimeType: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    await requireMember(ctx);
    const audio = new Uint8Array(args.audio);
    const { mime } = await validateAudio(audio, args.mimeType);
    const fingerprint = Buffer.from(
      await crypto.subtle.digest("SHA-256", args.audio),
    ).toString("hex");
    const { idea, claimed } = await ctx.runMutation(
      internal.heroIdeaState.claim,
      {
        tokenHash: await capabilityHash(args.capability),
        requestId: args.requestId,
        fingerprint,
        baseFingerprint: await digest("speech"),
        kind: "speech",
        source: "spoken",
      },
    );
    if (!claimed)
      throw new Error(
        "That recording was already sent. Check the words or make a new recording.",
      );
    const diagnostics = createDiagnostics(ctx, {
      name: "hero_idea.transcribe",
      traceId: createCapability(),
      source: "node",
      purpose: "hero_transcription",
    });
    await diagnostics.start();
    try {
      const transcript = await transcribeAudio(
        audio,
        mime,
        diagnostics.providerProgress({
          provider: "gemini",
          model: process.env.SPEECH_GEMINI_MODEL ?? GEMINI_FAST_MODEL,
          purpose: "hero_transcription",
          business: {
            onRetry: async () => {
              if (
                !(await ctx.runQuery(internal.heroIdeaState.active, {
                  ideaId: idea._id,
                }))
              )
                throw new Error("Cancelled transcription.");
            },
          },
        }),
      );
      if (
        !(await ctx.runMutation(internal.heroIdeaState.finish, {
          ideaId: idea._id,
          state: "READY",
        }))
      )
        throw new Error("Cancelled transcription.");
      await diagnostics.finish("succeeded");
      return transcript;
    } catch {
      await ctx.runMutation(internal.heroIdeaState.finish, {
        ideaId: idea._id,
        state: "FAILED",
      });
      await diagnostics.finish(
        "failed",
        new Error("Speech transcription failed."),
      );
      throw new Error(
        "We couldn’t transcribe that recording. Your hero and typed words are kept. Record again or type instead.",
      );
    }
  },
});
