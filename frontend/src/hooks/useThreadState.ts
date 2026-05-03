import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadState } from "@langchain/langgraph-sdk";
import { langgraphClient } from "@/lib/langgraphClient";
import { type ChatTurn, messagesFromStateValues } from "@/lib/messages";

export function useThreadState(threadId: string | null) {
  const [state, setState] = useState<ThreadState | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatTurn[]>([]);
  messagesRef.current = messages;

  const reload = useCallback(async () => {
    if (!threadId) {
      setState(null);
      setMessages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ts = await langgraphClient.threads.getState(threadId);
      setState(ts);
      setMessages(messagesFromStateValues(ts.values));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  /**
   * Poll the thread state until a NEW assistant message appears (compared
   * to the snapshot taken right before sending the user's message), or the
   * timeout elapses. Returns true if a new assistant message was detected.
   *
   * This exists because LangGraph's thread state is eventually consistent:
   * `getState()` immediately after a stream finishes can return stale data
   * without the just-streamed assistant turn. Without polling, we would
   * clear the in-memory streamed text and leave the user staring at a blank
   * spot where the answer should be.
   */
  const reloadUntilNewAssistant = useCallback(
    async (
      previousAssistantCount: number,
      timeoutMs = 6000,
      intervalMs = 250,
    ): Promise<boolean> => {
      if (!threadId) return false;
      const start = Date.now();
      let detected = false;
      while (Date.now() - start < timeoutMs) {
        try {
          const ts = await langgraphClient.threads.getState(threadId);
          const next = messagesFromStateValues(ts.values);
          const assistantCount = next.filter(
            (m) => m.role === "assistant",
          ).length;
          if (assistantCount > previousAssistantCount) {
            setState(ts);
            setMessages(next);
            detected = true;
            break;
          }
        } catch {
          // swallow transient fetch errors and retry
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      // Always do one final reload at the end so UI reflects whatever state
      // exists, even if no new assistant message was detected within timeout
      // (in that case, the streamed text remains visible as a fallback).
      if (!detected) await reload();
      return detected;
    },
    [threadId, reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    state,
    messages,
    loading,
    error,
    reload,
    reloadUntilNewAssistant,
  };
}
