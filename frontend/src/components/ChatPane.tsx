import type { ChatTurn } from "@/lib/messages";
import type { AgentStep } from "@/hooks/useThreadRuns";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <polyline points="1 4 1 10 7 10" />
      <polyline points="23 20 23 14 17 14" />
      <path d="M20.49 9A9 9 0 005.64 5.64L1 10" />
      <path d="M3.51 15a9 9 0 0014.85 3.36L23 14" />
    </svg>
  );
}

function AlertTriangle() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function ChatPane({
  remoteMessages,
  pendingUserText,
  streamingAssistant,
  streamError,
  stateError,
  subagentErrors,
  isRunning,
  sendDisabled,
  onSend,
  onRetry,
  agentSteps,
}: {
  remoteMessages: ChatTurn[];
  pendingUserText: string | null;
  streamingAssistant: string;
  streamError: string | null;
  stateError: string | null;
  /** Per-subagent / per-tool errors aggregated from the current run. */
  subagentErrors: string[];
  isRunning: boolean;
  sendDisabled: boolean;
  onSend: (text: string) => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  agentSteps: AgentStep[];
}) {
  // Stream-level errors (network drop, SSE failure, agent crash) are the most
  // severe — they block the answer. Show them in a red banner with Retry.
  // State errors are read-only (failed to fetch thread state) — orange/info.
  // Subagent/tool errors are partial — surface them but the agent may still
  // have produced a valid final answer.
  const hasFatal = !!streamError;
  const hasStateError = !!stateError && !streamError;
  const hasPartialErrors = !hasFatal && subagentErrors.length > 0 && !isRunning;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {hasFatal && (
        <div className="animate-fade-in shrink-0 border-b border-red-200 bg-red-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <span className="mt-0.5 text-red-500">
              <AlertTriangle />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-ui text-[12px] font-semibold text-red-700">
                The run failed
              </p>
              <p className="font-ui text-[12px] leading-relaxed text-red-600 break-words">
                {streamError}
              </p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={isRunning}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1 font-ui text-[11.5px] font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshIcon />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {hasStateError && (
        <div className="animate-fade-in shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 font-ui text-xs text-amber-800">
          Could not load thread history: {stateError}
        </div>
      )}

      {hasPartialErrors && (
        <div className="animate-fade-in shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <span className="mt-0.5 text-amber-500">
              <AlertTriangle />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-ui text-[12px] font-semibold text-amber-800">
                {subagentErrors.length} subagent
                {subagentErrors.length === 1 ? "" : "s"} or tool
                {subagentErrors.length === 1 ? "" : "s"} reported errors
              </p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 font-ui text-[11.5px] leading-relaxed text-amber-700">
                {subagentErrors.slice(0, 3).map((err, i) => (
                  <li key={i} className="break-words">
                    {err.length > 200 ? err.slice(0, 200) + "…" : err}
                  </li>
                ))}
                {subagentErrors.length > 3 && (
                  <li className="italic text-amber-600/80">
                    …and {subagentErrors.length - 3} more (see thinking tree)
                  </li>
                )}
              </ul>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={isRunning}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-ui text-[11.5px] font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshIcon />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <MessageList
        messages={remoteMessages}
        pendingUserText={pendingUserText}
        streamingAssistant={streamingAssistant}
        agentSteps={agentSteps}
        isRunning={isRunning}
        onSuggest={onSend}
      />

      <Composer disabled={sendDisabled} onSend={onSend} />
    </div>
  );
}
