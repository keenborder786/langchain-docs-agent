import { useCallback, useEffect, useRef, useState } from "react";
import { langgraphClient } from "@/lib/langgraphClient";
import { DEFAULT_CONVERSATION_TITLE, GRAPH_ASSISTANT_ID } from "@/lib/constants";
import { useThreadRuns } from "@/hooks/useThreadRuns";
import { useThreadList } from "@/hooks/useThreadList";
import { useThreadState } from "@/hooks/useThreadState";
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

  const [opError, setOpError] = useState<string | null>(null);

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
    reloadUntilNewAssistant,
  } = useThreadState(selectedThreadId);

  // Stable refs to the latest reload helpers so onStreamDone can reach them
  // without re-creating the callback (which would re-instantiate
  // useThreadRuns and break running streams).
  const reloadUntilNewAssistantRef = useRef(reloadUntilNewAssistant);
  useEffect(() => {
    reloadUntilNewAssistantRef.current = reloadUntilNewAssistant;
  }, [reloadUntilNewAssistant]);

  const selectedThreadIdRef = useRef(selectedThreadId);
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  const onStreamDone = useCallback(
    async (threadId: string) => {
      const previousCount =
        preRunAssistantCountByThread.current[threadId] ?? 0;
      // Always refresh the thread list (timestamps / titles may have moved).
      bumpList();

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
    [bumpList],
  );

  const {
    sendMessage,
    getRunState,
    runningThreadIds,
    clearStreamingForThread,
    clearRunForThread,
  } = useThreadRuns(onStreamDone);

  const clearStreamingForThreadRef = useRef(clearStreamingForThread);
  useEffect(() => {
    clearStreamingForThreadRef.current = clearStreamingForThread;
  }, [clearStreamingForThread]);

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
      } catch (e) {
        showOpError("Could not set conversation title", e);
      }
    },
    [threads, bumpList, showOpError],
  );

  const handleNew = useCallback(async () => {
    try {
      const t = await langgraphClient.threads.create({
        metadata: { title: DEFAULT_CONVERSATION_TITLE },
        graphId: GRAPH_ASSISTANT_ID,
      });
      // A brand-new thread should land on a clean slate. Drop any stray
      // run state we might have for this id (we won't, but it's defensive),
      // clear pending/last-user state for it, and switch to it.
      clearRunForThread(t.thread_id);
      setPendingUserByThread((prev) => {
        const { [t.thread_id]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
      setLastUserTextByThread((prev) => {
        const { [t.thread_id]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
      delete preRunAssistantCountByThread.current[t.thread_id];
      setSelectedThreadId(t.thread_id);
      bumpList();
    } catch (e) {
      showOpError("Could not create new conversation", e);
    }
  }, [bumpList, showOpError, clearRunForThread]);

  const handleRename = useCallback(
    async (threadId: string, title: string) => {
      const th = threads.find((x) => x.thread_id === threadId);
      const prevMeta = (th?.metadata ?? {}) as Record<string, unknown>;
      try {
        await langgraphClient.threads.update(threadId, {
          metadata: { ...prevMeta, title },
        });
        bumpList();
      } catch (e) {
        showOpError("Could not rename conversation", e);
      }
    },
    [threads, bumpList, showOpError],
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
      }
    },
    [selectedThreadId, bumpList, showOpError, clearRunForThread],
  );

  const handleSend = useCallback(
    async (text: string) => {
      let tid = selectedThreadId;
      if (!tid) {
        try {
          const t = await langgraphClient.threads.create({
            metadata: { title: DEFAULT_CONVERSATION_TITLE },
            graphId: GRAPH_ASSISTANT_ID,
          });
          tid = t.thread_id;
          setSelectedThreadId(tid);
          bumpList();
        } catch (e) {
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
      // Set the title immediately (before the run starts) so the sidebar
      // shows the user's question as the conversation name right away,
      // not only after the agent has finished responding.
      await maybeAutoTitle(threadId, text);
      try {
        await sendMessage(threadId, text);
      } finally {
        setPendingUserByThread((prev) => {
          const { [threadId]: _drop, ...rest } = prev;
          void _drop;
          return rest;
        });
      }
    },
    [
      selectedThreadId,
      sendMessage,
      maybeAutoTitle,
      bumpList,
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

  const pendingUser = selectedThreadId
    ? pendingUserByThread[selectedThreadId] ?? null
    : null;
  const lastUserText = selectedThreadId
    ? lastUserTextByThread[selectedThreadId] ?? null
    : null;

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
          runningThreadIds={runningThreadIds}
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
          isRunning={isRunning}
          sendDisabled={isRunning}
          onSend={handleSend}
          onRetry={lastUserText ? handleRetry : undefined}
          agentSteps={agentSteps}
        />
      </div>
    </div>
  );
}
