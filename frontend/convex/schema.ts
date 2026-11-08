import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  catalogContent,
  heroSetupChoices,
  ideaPart,
  storySetupChoices,
} from "./lib/catalogValidators";

export const readingLevel = v.union(
  v.literal("AGES_4_6"),
  v.literal("AGES_7_9"),
  v.literal("AGES_10_12"),
);

export const storyStatus = v.union(
  v.literal("SETUP"),
  v.literal("IN_PROGRESS"),
  v.literal("COMPLETED"),
);

export const chapterStatus = v.union(
  v.literal("PITCHING"),
  v.literal("DIRECTING"),
  v.literal("WRITING"),
  v.literal("REVIEWING"),
  v.literal("LOCKED"),
);

export const extractionStatus = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("DONE"),
  v.literal("FAILED"),
);

export const retryProgress = v.object({
  attempt: v.number(),
  maxAttempts: v.number(),
  nextRetryAt: v.number(),
});

export const diagnosticLevel = v.union(
  v.literal("debug"),
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
);

export const diagnosticSource = v.union(
  v.literal("web"),
  v.literal("ios"),
  v.literal("android"),
  v.literal("convex"),
  v.literal("node"),
);

export const diagnosticStatus = v.union(
  v.literal("started"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("degraded"),
  v.literal("skipped"),
  v.literal("superseded"),
  v.literal("recovered"),
);

export const diagnosticOutcome = v.union(
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("timeout"),
  v.literal("unknown"),
);

export const diagnosticSettlement = v.union(
  v.literal("unknown"),
  v.literal("charged"),
  v.literal("not_charged"),
);

export const diagnosticUsage = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  costMicroUsd: v.optional(v.number()),
  currency: v.optional(v.string()),
  costBasis: v.optional(
    v.union(
      v.literal("reported"),
      v.literal("estimated"),
      v.literal("settled"),
      v.literal("unknown"),
    ),
  ),
});

export const exportStatus = v.union(
  v.literal("PREPARING_COVER"),
  v.literal("BUILDING"),
  v.literal("READY"),
  v.literal("FAILED"),
);

export const itemStatus = v.union(
  v.literal("IN_BACKPACK"),
  v.literal("RESERVED_THIS_CHAPTER"),
  v.literal("USED"),
);

export const beatStyle = v.union(
  v.literal("BOLD_ACTION"),
  v.literal("CLEVER_TRICK"),
  v.literal("SILLY_TWIST"),
  v.literal("KID_WILDCARD"),
);

export const beatCard = v.object({
  cardId: v.string(),
  style: beatStyle,
  title: v.string(),
  kidFriendlyPitch: v.string(),
  iconEmoji: v.string(),
  suggestedItemId: v.optional(v.string()),
});

export const directorModifiers = v.object({
  useItemId: v.optional(v.string()),
  spotlightCharacterId: v.optional(v.id("characters")),
  weatherOrMood: v.optional(
    v.union(
      v.literal("SUNNY"),
      v.literal("STORMY"),
      v.literal("SPOOKY_NIGHT"),
      v.literal("BUBBLY_CHAOS"),
    ),
  ),
  soundEffectsBoost: v.boolean(),
  endingStyle: v.union(v.literal("CLIFFHANGER"), v.literal("COZY_PAUSE")),
});

export default defineSchema({
  heroIdeaSessions: defineTable({
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    requests: v.optional(v.number()),
    windowStartedAt: v.number(),
    units: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_expires", ["expiresAt"]),
  heroIdeas: defineTable({
    sessionId: v.id("heroIdeaSessions"),
    requestId: v.string(),
    kind: v.union(v.literal("idea"), v.literal("speech")),
    source: v.union(v.literal("typed"), v.literal("spoken")),
    state: v.union(
      v.literal("PENDING"),
      v.literal("READY"),
      v.literal("CONFIRMED"),
      v.literal("REJECTED"),
      v.literal("FAILED"),
      v.literal("CANCELLED"),
    ),
    fingerprint: v.string(),
    interpretationVersion: v.optional(v.literal("v1")),
    baseFingerprint: v.string(),
    parts: v.optional(v.array(ideaPart)),
    confirmedText: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_request", ["sessionId", "requestId"])
    .index("by_expires", ["expiresAt"]),
  heroIdeaQuota: defineTable({
    key: v.string(),
    units: v.number(),
    sessions: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expires", ["expiresAt"]),
  catalogOptions: defineTable({
    ...catalogContent,
    revision: v.number(),
    active: v.boolean(),
    withdrawnAt: v.optional(v.number()),
    createdAt: v.number(),
    retiredAt: v.optional(v.number()),
  })
    .index("by_key_revision", ["key", "revision"])
    .index("by_category_active_order", ["category", "active", "sortOrder"])
    .index("by_active", ["active"]),
  stories: defineTable({
    title: v.string(),
    status: storyStatus,
    readingLevel,
    totalChapters: v.number(),
    vibe: v.string(),
    artStyle: v.string(),
    worldState: v.object({
      setting: v.string(),
      centralProblem: v.string(),
      unresolvedThreads: v.array(v.string()),
    }),
    items: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        status: itemStatus,
        usedInChapter: v.optional(v.number()),
      }),
    ),
    setupChoices: v.optional(storySetupChoices),
    authorName: v.optional(v.string()), // typed credit on the cover and title page
    coverFileId: v.optional(v.id("_storage")),
    epubFileId: v.optional(v.id("_storage")),
    traceId: v.optional(v.string()),
    exportStatus: v.optional(exportStatus),
    exportRunId: v.optional(v.string()),
    exportStartedAt: v.optional(v.number()),
    exportError: v.optional(v.string()),
    exportWarning: v.optional(v.string()),
    exportRetry: v.optional(retryProgress),
    createdAt: v.number(),
  }),

  characters: defineTable({
    storyId: v.id("stories"),
    name: v.string(),
    role: v.union(
      v.literal("PROTAGONIST"),
      v.literal("SIDEKICK"),
      v.literal("PET"),
      v.literal("ANTAGONIST"),
    ),
    quirk: v.string(),
    visualDescription: v.string(),
    referenceFileId: v.optional(v.id("_storage")),
    setupChoices: v.optional(heroSetupChoices),
  }).index("by_story", ["storyId"]),

  chapters: defineTable({
    storyId: v.id("stories"),
    index: v.number(),
    title: v.optional(v.string()), // set by the post-chapter extraction
    arcRole: v.string(),
    status: chapterStatus,
    writingRunId: v.optional(v.string()),
    writingStartedAt: v.optional(v.number()),
    writingError: v.optional(v.string()),
    writingRetry: v.optional(retryProgress),
    beatCards: v.array(beatCard),
    recapOneLiner: v.optional(v.string()),
    chosenBeat: v.optional(beatCard),
    modifiers: v.optional(directorModifiers),
    paragraphs: v.array(v.string()),
    summaryBullets: v.array(v.string()),
    vocabNotes: v.array(
      v.object({ word: v.string(), kidDefinition: v.string() }),
    ),
    extractionStatus,
    illustrationPrompt: v.optional(v.string()), // written by the extractor
    videoMotionPrompt: v.optional(v.string()),
    illustrationFileId: v.optional(v.id("_storage")),
  })
    .index("by_story", ["storyId", "index"])
    .index("by_story_status", ["storyId", "status"]),

  // Bounded operation summaries and the important transitions inside them.
  // Detailed provider attempts stay in JSON console lines.
  diagnosticOperations: defineTable({
    operationId: v.string(),
    traceId: v.optional(v.string()),
    parentOperationId: v.optional(v.string()),
    runId: v.optional(v.string()),
    name: v.string(),
    source: diagnosticSource,
    storyId: v.optional(v.id("stories")),
    chapterId: v.optional(v.id("chapters")),
    status: diagnosticStatus,
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    safeMessage: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    purpose: v.optional(v.string()),
    attempts: v.optional(v.number()),
    retries: v.optional(v.number()),
    queueDelayMs: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_operation", ["operationId"])
    .index("by_story_started", ["storyId", "startedAt"])
    .index("by_status_started", ["status", "startedAt"])
    .index("by_started", ["startedAt"])
    .index("by_expires", ["expiresAt"]),

  diagnosticEvents: defineTable({
    eventId: v.string(),
    operationId: v.optional(v.string()),
    traceId: v.optional(v.string()),
    parentOperationId: v.optional(v.string()),
    runId: v.optional(v.string()),
    name: v.string(),
    level: diagnosticLevel,
    source: diagnosticSource,
    sequence: v.number(),
    stage: v.optional(v.string()),
    status: v.optional(diagnosticStatus),
    errorCode: v.optional(v.string()),
    safeMessage: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    durationMs: v.optional(v.number()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    purpose: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    requestId: v.optional(v.string()),
    attempt: v.optional(v.number()),
    usage: v.optional(diagnosticUsage),
    storyId: v.optional(v.id("stories")),
    chapterId: v.optional(v.id("chapters")),
    timestamp: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    bytes: v.optional(v.number()),
    bytesBefore: v.optional(v.number()),
    bytesAfter: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_operation_sequence", ["operationId", "sequence"])
    .index("by_story_timestamp", ["storyId", "timestamp"])
    .index("by_timestamp", ["timestamp"])
    .index("by_expires", ["expiresAt"]),

  diagnosticReceipts: defineTable({
    dedupeKey: v.string(),
    provider: v.string(),
    model: v.optional(v.string()),
    purpose: v.optional(v.string()),
    requestId: v.optional(v.string()),
    operationId: v.optional(v.string()),
    traceId: v.optional(v.string()),
    storyId: v.optional(v.id("stories")),
    chapterId: v.optional(v.id("chapters")),
    attempt: v.number(),
    outcome: diagnosticOutcome,
    httpStatus: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    usage: v.optional(diagnosticUsage),
    costMicroUsd: v.optional(v.number()),
    currency: v.optional(v.string()),
    costBasis: v.union(
      v.literal("reported"),
      v.literal("estimated"),
      v.literal("settled"),
      v.literal("unknown"),
    ),
    settlementState: diagnosticSettlement,
    settledCostMicroUsd: v.optional(v.number()),
    reconciledAt: v.optional(v.number()),
    note: v.optional(v.string()),
    observedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_operation", ["operationId"])
    .index("by_story_observed", ["storyId", "observedAt"])
    .index("by_observed", ["observedAt"])
    .index("by_settlement", ["settlementState"])
    .index("by_expires", ["expiresAt"]),

  diagnosticQuota: defineTable({
    key: v.string(),
    events: v.number(),
    operations: v.number(),
    bytes: v.number(),
    dropped: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
