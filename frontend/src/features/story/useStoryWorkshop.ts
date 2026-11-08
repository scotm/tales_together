import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  useAction,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { useState } from "react";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { useQueryDiagnostics } from "@/lib/diagnostics/query";
import { saveBook } from "@/lib/saveBook";

/** Shared story operations; Convex remains the chapter workflow authority. */
export function useStoryWorkshop(storyId: string) {
  const diagnostics = useDiagnostics();
  const connection = useConvexConnectionState();
  const story = useQuery(api.stories.get, {
    storyId: storyId as Id<"stories">,
  });
  useQueryDiagnostics("stories.get", story, connection.isWebSocketConnected);
  const pitchChapter = useAction(api.chapters.pitchChapter);
  const writeChapter = useAction(api.chapters.writeChapter);
  const chooseBeat = useMutation(api.chapters.chooseBeat);
  const lockChapter = useMutation(api.chapters.lockChapter);
  const retryExport = useMutation(api.exportJobs.retry);

  const [pitching, setPitching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [queuingExport, setQueuingExport] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allLocked = Boolean(
    story?.chapters.length &&
      story.chapters.every((entry) => entry.status === "LOCKED"),
  );
  const activeChapter =
    story?.chapters.find((entry) => entry.status !== "LOCKED") ??
    story?.chapters[story.chapters.length - 1];
  // A finished chapter can be reopened from the list without leaving the story.
  const chapter =
    story?.chapters.find((entry) => entry._id === openId) ?? activeChapter;
  const isWriting =
    writing || (chapter?.status === "WRITING" && Boolean(chapter.writingRunId));
  const exportBusy =
    queuingExport ||
    story?.story.exportStatus === "PREPARING_COVER" ||
    story?.story.exportStatus === "BUILDING";

  async function deal() {
    if (!chapter) return;
    setPitching(true);
    setError(null);
    try {
      await diagnostics.track("chapters.pitch", (operationId) =>
        pitchChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not deal the cards",
      );
    } finally {
      setPitching(false);
    }
  }

  async function pick(cardId: string) {
    if (!chapter) return;
    setError(null);
    try {
      await diagnostics.track("chapters.chooseBeat", () =>
        chooseBeat({ chapterId: chapter._id, cardId }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pick");
    }
  }

  async function nextChapter() {
    if (!chapter) return;
    setLocking(true);
    setError(null);
    try {
      await diagnostics.track("chapters.lock", (operationId) =>
        lockChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not turn the page",
      );
    } finally {
      setLocking(false);
    }
  }

  async function write() {
    if (!chapter) return;
    setWriting(true);
    setError(null);
    try {
      await diagnostics.track("chapters.write", (operationId) =>
        writeChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't finish this chapter. Your choice is saved. Try again.",
      );
    } finally {
      setWriting(false);
    }
  }

  async function prepareDownload() {
    setQueuingExport(true);
    setError(null);
    try {
      await diagnostics.track("export.retry", (operationId) =>
        retryExport({
          storyId: storyId as Id<"stories">,
          clientOperationId: operationId,
        }),
      );
    } catch {
      setError("We couldn't prepare the download. Try again.");
    } finally {
      setQueuingExport(false);
    }
  }

  async function download() {
    if (!story?.story.epubUrl) return;
    setSaving(true);
    setError(null);
    try {
      await diagnostics.track("delivery.save_book", () =>
        saveBook(
          story.story.epubUrl as string,
          story.story.title,
          (stage, fields) =>
            diagnostics.record(`delivery.${stage}`, fields ?? {}),
        ),
      );
    } catch {
      setError("We couldn't save the book. Your download is ready; try again.");
    } finally {
      setSaving(false);
    }
  }

  return {
    story,
    chapter,
    allLocked,
    isWriting,
    exportBusy,
    pitching,
    locking,
    saving,
    error,
    setOpenId,
    deal,
    pick,
    nextChapter,
    write,
    prepareDownload,
    download,
  };
}
