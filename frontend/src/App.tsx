import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { langgraphClient } from "@/lib/langgraphClient";
import { DEFAULT_CONVERSATION_TITLE, GRAPH_ASSISTANT_ID } from "@/lib/constants";
import { useThreadRuns, type ThreadRunState } from "@/hooks/useThreadRuns";
import { useThreadList } from "@/hooks/useThreadList";
import { useThreadState } from "@/hooks/useThreadState";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { ChatPane } from "@/components/ChatPane";
import { Sidebar } from "@/components/Sidebar";
import type { Thread } from "@langchain/langgraph-sdk";

function threadTitleFromThread(t: Thread | undefined): string {
  if (!t) return DEFAULT_CONVERSATION_TITLE;
  const meta = t.metadata as Record<string, unknown> | undefined;
  const title = meta?.title;
  return typeof title === "string" && title.trim() ? title : DEFAULT_CONVERSATION_TITLE;
}

export default function App() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [listRefresh, setListRefresh] = useState(0);
  // Per-thread UI state. Each thread tracks its own pendingUserText (the user
  // message currently in flight) and lastUserText (for the Retry button).
  // These are kept off the runs hook because they survive past the stream's
  // lifecycle and are tied to the thread the user is viewing, not the run.
  const [pendingUserByThread, setPendingUserByThread] = useState<
    Record<string, string>
  >({});
  const [lastUserTextByThread, setLastUserTextByThread] = useState<
    Record<string, string>
  >({});
  // Per-thread snapshot of remote assistant count taken right before each
  // send. Used by onStreamDone to know what "new assistant message" means
  // for that specific thread.
  const preRunAssistantCountByThread = useRef<Record<string, number>>({});

  // Thread IDs created by this tab but not yet reflected in the fetched
  // thread list. The deselect-safety effect must skip these IDs or it would
  // immediately null out a selection that was just set by handleSend.
  const justCreatedThreadIds = useRef<Set<string>>(new Set());

  // Optimistic user-bubble text shown the moment a suggestion card / composer
  // submit is clicked, before the new thread has been created on the server.
  // This prevents a flash of the welcome screen during the threads.create()
  // round-trip.
  const [bootstrappingText, setBootstrappingText] = useState<string | null>(
    null,
  );

  const [opError, setOpError] = useState<string | null>(null);

  // Running thread IDs reported by other browser tabs via BroadcastChannel.
  // Merged with the local runningThreadIds so the sidebar indicator stays in
  // sync across all open tabs even when only one tab owns the SSE stream.
  const [externalRunningThreadIds, setExternalRunningThreadIds] = useState<
    Set<string>
  >(new Set());

  const showOpError = useCallback((label: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    setOpError(`${label}: ${msg}`);
    window.setTimeout(() => setOpError(null), 6000);
  }, []);

  const { threads, loading: listLoading, error: listError } = useThreadList(listRefresh);
  const bumpList = useCallback(() => setListRefresh((n) => n + 1), []);

  const {
    messages: remoteMessages,
    error: stateError,
    reload: reloadThreadState,
    reloadUntilNewAssistant,
  } = useThreadState(selectedThreadId);

  // Stable refs to the latest reload helpers so onStreamDone can reach them
  // without re-creating the callback (which would re-instantiate
  // useThreadRuns and break running streams).
  const reloadUntilNewAssistantRef = useRef(reloadUntilNewAssistant);
  useEffect(() => {
    reloadUntilNewAssistantRef.current = reloadUntilNewAssistant;
  }, [reloadUntilNewAssistant]);

  const reloadThreadStateRef = useRef(reloadThreadState);
  useEffect(() => {
    reloadThreadStateRef.current = reloadThreadState;
  }, [reloadThreadState]);

  const selectedThreadIdRef = useRef(selectedThreadId);
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  // ── useThreadRuns must be initialized BEFORE the cross-tab sync handler
  // (the run_progress handler needs applyExternalRunSnapshot). onStreamDone
  // is set up immediately after via a forward ref so we can still pass it
  // into useThreadRuns at hook init time.
  const onStreamDoneRef = useRef<
    (threadId: string) => void | Promise<void>
  >(() => {});
  const onStreamDoneCb = useCallback(
    (threadId: string) => onStreamDoneRef.current(threadId),
    [],
  );

  const {
    sendMessage,
    getRunState,
    runs,
    runningThreadIds,
    clearStreamingForThread,
    clearRunForThread,
    isThreadOwnedLocally,
    applyExternalRunSnapshot,
  } = useThreadRuns(onStreamDoneCb);

  const clearStreamingForThreadRef = useRef(clearStreamingForThread);
  useEffect(() => {
    clearStreamingForThreadRef.current = clearStreamingForThread;
  }, [clearStreamingForThread]);

  const clearRunForThreadRef = useRef(clearRunForThread);
  useEffect(() => {
    clearRunForThreadRef.current = clearRunForThread;
  }, [clearRunForThread]);

  // ── Cross-tab sync ─────────────────────────────────────────────────────────
  // BroadcastChannel events flow only to OTHER tabs; the originating tab
  // handles its own state directly. Handlers below mirror what the originating
  // tab already does locally so every open tab converges on the same server
  // state — and the same in-flight run UX — without a persistent WebSocket.
  const { broadcast } = useCrossTabSync({
    // Another tab created / renamed / deleted a thread or auto-titled one.
    onThreadListChanged: bumpList,

    // Another tab told us thread state changed (typically post-run).
    onThreadStateChanged: (threadId) => {
      if (selectedThreadIdRef.current === threadId) {
        void reloadThreadStateRef.current();
      }
    },

    // Another tab started streaming on threadId; show the running indicator.
    onRunStarted: (threadId) => {
      setExternalRunningThreadIds((prev) => {
        if (prev.has(threadId)) return prev;
        return new Set([...prev, threadId]);
      });
    },

    // Another tab made progress on its run. Mirror its full snapshot
    // (streamingAssistant + agentSteps + isRunning + error) into our own
    // runs state so when the user views that thread they see the same live
    // tree of tools / subagents and the same streamed text.
    onRunProgress: (threadId, snapshot) => {
      applyExternalRunSnapshot(threadId, snapshot);
    },

    // Another tab's user has just sent / cleared a pending message. Mirror
    // that bubble in our pendingUserByThread so all tabs render the same
    // user-side bubble during the run.
    onUserPending: (threadId, text) => {
      setPendingUserByThread((prev) => {
        if (text === null) {
          if (!(threadId in prev)) return prev;
          const { [threadId]: _drop, ...rest } = prev;
          void _drop;
          return rest;
        }
        if (prev[threadId] === text) return prev;
        return { ...prev, [threadId]: text };
      });
      if (text !== null) {
        setLastUserTextByThread((prev) =>
          prev[threadId] === text ? prev : { ...prev, [threadId]: text },
        );
      }
    },

    // Another tab's run finished. Refresh list, reload thread state if
    // visible, then drop the run snapshot for a clean handoff to the
    // persisted assistant message.
    onRunFinished: async (threadId) => {
      setExternalRunningThreadIds((prev) => {
        if (!prev.has(threadId)) return prev;
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      bumpList();
      if (selectedThreadIdRef.current === threadId) {
        // Wait for the new assistant turn to appear in persisted state, then
        // drop the in-memory snapshot so we hand off seamlessly to the
        // canonical message.
        await reloadThreadStateRef.current();
      }
      clearRunForThreadRef.current?.(threadId);
    },
  });

  // Owning tab broadcasts its current run snapshots to shadow tabs.
  // Unthrottled — every render that produces a new run state for an owned
  // thread is published immediately, so shadow tabs render at the same rate
  // as the owner (essentially the React render cadence, ~60fps). We track
  // the last-broadcasted reference per-thread to avoid republishing slices
  // that didn't change in this render.
  const lastBroadcastedRunsRef = useRef<Record<string, ThreadRunState>>({});
  useEffect(() => {
    for (const tid of Object.keys(runs)) {
      if (!isThreadOwnedLocally(tid)) continue;
      if (runs[tid] === lastBroadcastedRunsRef.current[tid]) continue;
      broadcast({ type: "run_progress", threadId: tid, snapshot: runs[tid] });
      lastBroadcastedRunsRef.current[tid] = runs[tid];
    }
    // Drop stale entries for threads whose runs slice was cleared.
    for (const tid of Object.keys(lastBroadcastedRunsRef.current)) {
      if (!(tid in runs)) delete lastBroadcastedRunsRef.current[tid];
    }
  }, [runs, broadcast, isThreadOwnedLocally]);

  const onStreamDone = useCallback(
    async (threadId: string) => {
      const previousCount =
        preRunAssistantCountByThread.current[threadId] ?? 0;
      // Always refresh the thread list (timestamps / titles may have moved).
      bumpList();
      // Notify other tabs so they refresh their list, hide the running
      // indicator, and reload thread state for the just-finished run.
      broadcast({ type: "thread_list_changed" });
      broadcast({ type: "run_finished", threadId });
      broadcast({ type: "thread_state_changed", threadId });

      // If the run that just finished is for the thread the user is
      // currently viewing, poll until remote state catches up so we can
      // smoothly hand off from streamed text to persisted message.
      // Otherwise just clear the streamed text — when the user switches to
      // that thread later, useThreadState will fetch the fresh state.
      if (selectedThreadIdRef.current === threadId) {
        const detected =
          await reloadUntilNewAssistantRef.current?.(previousCount);
        if (detected) clearStreamingForThreadRef.current?.(threadId);
      } else {
        clearStreamingForThreadRef.current?.(threadId);
      }
    },
    [bumpList, broadcast],
  );
  // Wire the just-defined onStreamDone into the forward ref so the version
  // we passed to useThreadRuns picks up the latest closure.
  useEffect(() => {
    onStreamDoneRef.current = onStreamDone;
  }, [onStreamDone]);

  // Deselect a thread that another tab deleted so this tab doesn't get stuck
  // on a conversation that no longer exists on the server.
  // Skip threads that were just created here — they may not have been indexed
  // by the server yet and would be falsely absent from the freshly-fetched
  // list. Once they appear we remove the guard.
  useEffect(() => {
    if (!selectedThreadId || listLoading || threads.length === 0) return;
    if (justCreatedThreadIds.current.has(selectedThreadId)) {
      if (threads.some((t) => t.thread_id === selectedThreadId)) {
        justCreatedThreadIds.current.delete(selectedThreadId);
      }
      return;
    }
    if (!threads.some((t) => t.thread_id === selectedThreadId)) {
      setSelectedThreadId(null);
    }
  }, [threads, listLoading, selectedThreadId]);

  // Merge locally-running threads with those reported by other tabs.
  const allRunningThreadIds = useMemo(
    () => new Set([...runningThreadIds, ...externalRunningThreadIds]),
    [runningThreadIds, externalRunningThreadIds],
  );

  // Slice the per-thread run state for the currently selected thread.
  const selectedRun = getRunState(selectedThreadId);
  const {
    streamingAssistant,
    agentSteps,
    isRunning,
    error: streamError,
  } = selectedRun;

  // Safety net: if we're not running and remote has caught up but a stale
  // streamed text is still hanging around for the selected thread, clear it.
  useEffect(() => {
    if (!selectedThreadId) return;
    if (isRunning) return;
    if (!streamingAssistant) return;
    const previousCount =
      preRunAssistantCountByThread.current[selectedThreadId] ?? 0;
    const assistantCount = remoteMessages.filter(
      (m) => m.role === "assistant",
    ).length;
    if (assistantCount > previousCount) {
      clearStreamingForThread(selectedThreadId);
    }
  }, [
    isRunning,
    streamingAssistant,
    remoteMessages,
    selectedThreadId,
    clearStreamingForThread,
  ]);

  const maybeAutoTitle = useCallback(
    async (threadId: string, userText: string) => {
      const th = threads.find((x) => x.thread_id === threadId);
      if (threadTitleFromThread(th) !== DEFAULT_CONVERSATION_TITLE) return;
      const short =
        userText.trim().length <= 48 ? userText.trim() : `${userText.trim().slice(0, 48)}…`;
      const prevMeta = (th?.metadata ?? {}) as Record<string, unknown>;
      try {
        await langgraphClient.threads.update(threadId, {
          metadata: { ...prevMeta, title: short },
        });
        bumpList();
        broadcast({ type: "thread_list_changed" });
      } catch (e) {
        showOpError("Could not set conversation title", e);
      }
    },
    [threads, bumpList, broadcast, showOpError],
  );

  const handleNew = useCallback(() => {
    // Lazy new-chat: just clear the selection and show the blank canvas.
    // The thread is created on-demand the moment the user sends their first
    // message (card click or composer). This prevents the sidebar from
    // flashing a new "New chat" item before the user has typed anything,
    // and removes the "going somewhere" feeling after clicking a suggestion.
    setSelectedThreadId(null);
    setBootstrappingText(null);
  }, []);

  const handleRename = useCallback(
    async (threadId: string, title: string) => {
      const th = threads.find((x) => x.thread_id === threadId);
      const prevMeta = (th?.metadata ?? {}) as Record<string, unknown>;
      try {
        await langgraphClient.threads.update(threadId, {
          metadata: { ...prevMeta, title },
        });
        bumpList();
        broadcast({ type: "thread_list_changed" });
      } catch (e) {
        showOpError("Could not rename conversation", e);
      }
    },
    [threads, bumpList, broadcast, showOpError],
  );

  const handleDelete = useCallback(
    async (threadId: string) => {
      // 1) Abort any in-flight stream and drop the local run state so the
      //    UI stops showing "Working…" the moment the user confirms.
      clearRunForThread(threadId);
      // 2) Drop all per-thread UI state for the deleted thread.
      setPendingUserByThread((prev) => {
        const { [threadId]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
      setLastUserTextByThread((prev) => {
        const { [threadId]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
      delete preRunAssistantCountByThread.current[threadId];
      if (selectedThreadId === threadId) setSelectedThreadId(null);
      // 3) Delete the thread on the LangGraph server. Even if this fails,
      //    the local cleanup above already happened so the user's UI
      //    reflects the intent; we surface the error so they can retry.
      try {
        await langgraphClient.threads.delete(threadId);
      } catch (e) {
        showOpError("Could not delete conversation", e);
      } finally {
        bumpList();
        broadcast({ type: "thread_list_changed" });
      }
    },
    [selectedThreadId, bumpList, broadcast, showOpError, clearRunForThread],
  );

  const handleSend = useCallback(
    async (text: string) => {
      let tid = selectedThreadId;
      if (!tid) {
        // Render the user's message as an optimistic bubble immediately so
        // the welcome screen disappears the instant a suggestion card is
        // clicked, even though threads.create() hasn't returned yet.
        setBootstrappingText(text);
        try {
          const t = await langgraphClient.threads.create({
            metadata: { title: DEFAULT_CONVERSATION_TITLE },
            graphId: GRAPH_ASSISTANT_ID,
          });
          tid = t.thread_id;
          // Guard against the deselect-safety effect before the list catches up.
          justCreatedThreadIds.current.add(tid);
          setSelectedThreadId(tid);
          bumpList();
          broadcast({ type: "thread_list_changed" });
        } catch (e) {
          setBootstrappingText(null);
          showOpError("Could not start a new conversation", e);
          return;
        }
      }
      const threadId = tid;
      // Snapshot the pre-run assistant count for THIS thread so onStreamDone
      // knows when a genuinely-new assistant turn has appeared.
      preRunAssistantCountByThread.current[threadId] = remoteMessages.filter(
        (m) => m.role === "assistant",
      ).length;
      setPendingUserByThread((prev) => ({ ...prev, [threadId]: text }));
      setLastUserTextByThread((prev) => ({ ...prev, [threadId]: text }));
      // Mirror the user bubble into every other tab immediately.
      broadcast({ type: "user_pending", threadId, text });
      // Optimistic bootstrap text is now owned by per-thread pending state.
      setBootstrappingText(null);
      // Set the title immediately (before the run starts) so the sidebar
      // shows the user's question as the conversation name right away,
      // not only after the agent has finished responding.
      await maybeAutoTitle(threadId, text);
      // Inform other tabs that this thread is now running so their sidebars
      // show the animated indicator without waiting for the run to complete.
      broadcast({ type: "run_started", threadId });
      try {
        await sendMessage(threadId, text);
      } finally {
        setPendingUserByThread((prev) => {
          const { [threadId]: _drop, ...rest } = prev;
          void _drop;
          return rest;
        });
        // Clear the user bubble in every other tab too.
        broadcast({ type: "user_pending", threadId, text: null });
      }
    },
    [
      selectedThreadId,
      sendMessage,
      maybeAutoTitle,
      bumpList,
      broadcast,
      remoteMessages,
      showOpError,
    ],
  );

  // Retry: re-run the most recent user message on the current thread.
  const handleRetry = useCallback(async () => {
    if (!selectedThreadId) return;
    const text = lastUserTextByThread[selectedThreadId];
    if (!text) return;
    await handleSend(text);
  }, [selectedThreadId, lastUserTextByThread, handleSend]);

  // Per-thread errors aggregated from the current selected run's steps.
  const subagentErrors = agentSteps
    .filter((s) => (s.type === "subagent" || s.type === "tool") && s.error)
    .map((s) => {
      if (s.type === "subagent") return `${s.name}: ${s.error}`;
      if (s.type === "tool") return `${s.name}: ${s.error}`;
      return "";
    });

  // pendingUser: prefer per-thread pending text, fall back to the optimistic
  // bootstrap bubble shown during the threads.create() round-trip.
  const pendingUser = selectedThreadId
    ? pendingUserByThread[selectedThreadId] ?? bootstrappingText
    : bootstrappingText;
  const lastUserText = selectedThreadId
    ? lastUserTextByThread[selectedThreadId] ?? null
    : null;

  // While we're bootstrapping a new thread (after a card click but before
  // the SSE stream begins), present the UI as "running" so the WelcomeState
  // hides and the composer disables. Once sendMessage starts, isRunning from
  // useThreadRuns takes over.
  const effectiveIsRunning = isRunning || bootstrappingText !== null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white font-ui">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <img src="/langchain-logo.svg" alt="LangChain" className="h-6 w-6" />
          <span className="font-ui text-[15px] font-semibold tracking-tight text-gray-900">
            Chat LangChain
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-ui text-[13px] font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </button>
      </header>

      {(listError || opError) && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-1.5 text-center font-ui text-xs text-red-700">
          {opError ?? listError}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          threads={threads}
          selectedId={selectedThreadId}
          loading={listLoading}
          runningThreadIds={allRunningThreadIds}
          onSelect={setSelectedThreadId}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />
        <ChatPane
          remoteMessages={remoteMessages}
          pendingUserText={pendingUser}
          streamingAssistant={streamingAssistant}
          streamError={streamError}
          stateError={stateError}
          subagentErrors={subagentErrors}
          isRunning={effectiveIsRunning}
          sendDisabled={effectiveIsRunning}
          onSend={handleSend}
          onRetry={lastUserText ? handleRetry : undefined}
          agentSteps={agentSteps}
        />
      </div>
    </div>
  );
}
