import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  useAction,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { useRef, useState } from "react";
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

  const pending = useRef(new Set<string>());
  const [selecting, setSelecting] = useState(false);
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
    story?.chapters.find(
      (entry) =>
        entry._id === openId &&
        (entry.status === "LOCKED" || entry._id === activeChapter?._id),
    ) ?? activeChapter;
  const viewingActive = chapter?._id === activeChapter?._id;
  const isWriting =
    writing || (chapter?.status === "WRITING" && Boolean(chapter.writingRunId));
  const exportBusy =
    queuingExport ||
    story?.story.exportStatus === "PREPARING_COVER" ||
    story?.story.exportStatus === "BUILDING";

  async function deal() {
    if (
      !chapter ||
      !viewingActive ||
      chapter.paragraphs.length ||
      isWriting ||
      pending.current.size
    )
      return;
    pending.current.add("pitch");
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
      pending.current.delete("pitch");
      setPitching(false);
    }
  }

  async function pick(cardId: string) {
    if (
      !chapter ||
      !viewingActive ||
      chapter.status !== "DIRECTING" ||
      isWriting ||
      pending.current.size
    )
      return;
    pending.current.add("pick");
    setSelecting(true);
    setError(null);
    try {
      await diagnostics.track("chapters.chooseBeat", () =>
        chooseBeat({ chapterId: chapter._id, cardId }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pick");
    } finally {
      pending.current.delete("pick");
      setSelecting(false);
    }
  }

  async function nextChapter() {
    if (
      !chapter ||
      !viewingActive ||
      chapter.status !== "REVIEWING" ||
      pending.current.size
    )
      return;
    pending.current.add("lock");
    setLocking(true);
    setError(null);
    try {
      await diagnostics.track("chapters.lock", (operationId) =>
        lockChapter({
          chapterId: chapter._id,
          clientOperationId: operationId,
        }),
      );
      setOpenId(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not turn the page",
      );
    } finally {
      pending.current.delete("lock");
      setLocking(false);
    }
  }

  async function write() {
    if (
      !chapter ||
      !viewingActive ||
      !chapter.chosenBeat ||
      chapter.paragraphs.length ||
      isWriting ||
      pending.current.size
    )
      return;
    pending.current.add("write");
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
      pending.current.delete("write");
      setWriting(false);
    }
  }

  async function prepareDownload() {
    if (exportBusy || pending.current.has("export")) return;
    pending.current.add("export");
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
      pending.current.delete("export");
      setQueuingExport(false);
    }
  }

  async function download() {
    if (!story?.story.epubUrl || pending.current.has("save")) return;
    pending.current.add("save");
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
      pending.current.delete("save");
      setSaving(false);
    }
  }

  return {
    story,
    chapter,
    activeChapter,
    viewingActive,
    selecting,
    connection,
    allLocked,
    isWriting,
    exportBusy,
    pitching,
    locking,
    saving,
    error,
    setOpenId: (id: string) => {
      const entry = story?.chapters.find((entry) => entry._id === id);
      if (
        entry &&
        (entry.status === "LOCKED" || entry._id === activeChapter?._id)
      )
        setOpenId(id);
    },
    deal,
    pick,
    nextChapter,
    write,
    prepareDownload,
    download,
  };
}

export type StoryWorkshop = ReturnType<typeof useStoryWorkshop>;
