import { useCallback, useEffect, useRef } from "react";
import type { ThreadRunState } from "@/hooks/useThreadRuns";

export type CrossTabEvent =
  | { type: "thread_list_changed" }
  | { type: "thread_state_changed"; threadId: string }
  | { type: "run_started"; threadId: string }
  | { type: "run_progress"; threadId: string; snapshot: ThreadRunState }
  | { type: "run_finished"; threadId: string }
  | { type: "user_pending"; threadId: string; text: string | null };

const CHANNEL_NAME = "langchain-chat-sync";

interface CrossTabHandlers {
  onThreadListChanged?: () => void;
  onThreadStateChanged?: (threadId: string) => void;
  onRunStarted?: (threadId: string) => void;
  onRunProgress?: (threadId: string, snapshot: ThreadRunState) => void;
  onRunFinished?: (threadId: string) => void;
  onUserPending?: (threadId: string, text: string | null) => void;
}

/**
 * Synchronises UI state across browser tabs using the BroadcastChannel API.
 *
 * One tab publishes a CrossTabEvent whenever it mutates server state or makes
 * progress on an in-flight run; every OTHER tab (BroadcastChannel never fires
 * in the originating tab) receives it and updates its UI accordingly. This
 * gives the same "live" feel as a WebSocket-broadcast architecture without
 * requiring a persistent connection.
 *
 * Falls back silently in environments where BroadcastChannel is unavailable.
 */
export function useCrossTabSync(handlers: CrossTabHandlers) {
  // Always keep the latest callbacks without re-registering the listener.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent<CrossTabEvent>) => {
      const ev = e.data;
      switch (ev.type) {
        case "thread_list_changed":
          handlersRef.current.onThreadListChanged?.();
          break;
        case "thread_state_changed":
          handlersRef.current.onThreadStateChanged?.(ev.threadId);
          break;
        case "run_started":
          handlersRef.current.onRunStarted?.(ev.threadId);
          break;
        case "run_progress":
          handlersRef.current.onRunProgress?.(ev.threadId, ev.snapshot);
          break;
        case "run_finished":
          handlersRef.current.onRunFinished?.(ev.threadId);
          break;
        case "user_pending":
          handlersRef.current.onUserPending?.(ev.threadId, ev.text);
          break;
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = useCallback((event: CrossTabEvent) => {
    channelRef.current?.postMessage(event);
  }, []);

  return { broadcast };
}
