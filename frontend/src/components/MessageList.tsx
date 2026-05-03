import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatTurn } from "@/lib/messages";
import type { AgentStep } from "@/hooks/useThreadRuns";
import { AgentSteps } from "./AgentSteps";

/* ── user avatar ─────────────────────────────────────────────── */

function UserAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
        <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z" />
      </svg>
    </div>
  );
}

/* ── assistant avatar ────────────────────────────────────────── */

function AssistantAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lc-brand/20 ring-1 ring-lc-border">
      <img src="/langchain-logo.svg" alt="" className="h-4 w-4" />
    </div>
  );
}

/* ── markdown ────────────────────────────────────────────────── */

function MarkdownContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="prose-lc">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {isStreaming && (
        <span className="animate-cursor inline-block h-[1em] w-[2px] translate-y-[2px] rounded-sm bg-lc-deep ml-0.5" />
      )}
    </div>
  );
}

/* ── welcome ─────────────────────────────────────────────────── */

const SUGGESTIONS = [
  "How do I build a multi-agent workflow with LangGraph?",
  "What's the difference between LangChain and LangGraph?",
  "How does LangSmith help with debugging agents?",
  "Explain Deep Agents and when to use them.",
];

function WelcomeState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="animate-slide-up flex flex-col items-center justify-center gap-8 px-6 py-20 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-lc-brand/15 ring-2 ring-lc-brand/25">
          <img src="/langchain-logo.svg" alt="LangChain" className="h-9 w-9" />
        </div>
        <h2 className="font-ui text-2xl font-semibold tracking-tight text-gray-900">
          What can I help with?
        </h2>
        <p className="max-w-sm font-ui text-sm leading-relaxed text-gray-500">
          Ask anything about LangChain, LangGraph, LangSmith, or Deep Agents.
          Answers grounded in live official docs.
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSuggest(q)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-ui text-[13px] text-gray-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-lc-brand/60 hover:bg-lc-muted/40 hover:shadow-md active:translate-y-0"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── message list ────────────────────────────────────────────── */

export function MessageList({
  messages,
  pendingUserText,
  streamingAssistant,
  agentSteps,
  isRunning,
  onSuggest,
}: {
  messages: ChatTurn[];
  pendingUserText: string | null;
  streamingAssistant: string;
  agentSteps: AgentStep[];
  isRunning: boolean;
  onSuggest: (q: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingAssistant, agentSteps.length, isRunning]);

  // Suppress the optimistic pending bubble if the remote state already
  // contains the same user message — LangGraph persists the user turn to
  // thread state almost immediately, so without this guard the same message
  // renders twice: once from remoteMessages and once from pendingUserText.
  const lastRemoteUser = [...messages].reverse().find((m) => m.role === "user");
  const pendingAlreadyPersisted =
    !!pendingUserText &&
    !!lastRemoteUser &&
    lastRemoteUser.content.trim() === pendingUserText.trim();
  const showPending = !!pendingUserText && !pendingAlreadyPersisted;

  const isEmpty = messages.length === 0 && !showPending && !isRunning;

  if (isEmpty) {
    return (
      <div className="flex-1 overflow-y-auto">
        <WelcomeState onSuggest={onSuggest} />
      </div>
    );
  }

  // Index of the most recent assistant message — we attach the collapsed
  // thinking tree above this message's markdown after the run completes.
  let lastAssistantIdx = -1;
  for (let k = messages.length - 1; k >= 0; k--) {
    if (messages[k].role === "assistant") { lastAssistantIdx = k; break; }
  }
  const showRecapOnLastAssistant =
    !isRunning && agentSteps.length > 0 && lastAssistantIdx !== -1;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">

        {messages.map((m, i) => {
          if (m.role === "tool" || m.role === "system") return null;

          if (m.role === "user") {
            return (
              <div key={m.id ?? i} className="animate-message-in flex items-start gap-3">
                <UserAvatar />
                <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 font-ui text-[14px] leading-relaxed text-gray-800">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            );
          }

          /* assistant */
          const isRecapTarget = showRecapOnLastAssistant && i === lastAssistantIdx;
          return (
            <div key={m.id ?? i} className="animate-message-in flex items-start gap-3">
              <AssistantAvatar />
              <div className="flex-1 min-w-0">
                {/* collapsed thinking tree for the just-completed run */}
                {isRecapTarget && (
                  <AgentSteps
                    steps={agentSteps}
                    isRunning={false}
                    defaultExpanded={false}
                  />
                )}
                <MarkdownContent content={m.content} />
              </div>
            </div>
          );
        })}

        {/* pending user (optimistic) — hidden once remote state has it */}
        {showPending ? (
          <div className="animate-message-in flex items-start gap-3">
            <UserAvatar />
            <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 font-ui text-[14px] leading-relaxed text-gray-800">
              <p className="whitespace-pre-wrap">{pendingUserText}</p>
            </div>
          </div>
        ) : null}

        {/* Inline streaming bubble — appears WHILE the run is in progress
            and ALSO persists after the run ends until the persisted thread
            state catches up with the new assistant turn. This guarantees
            the user always sees the agent's answer even if remote state is
            briefly stale. App.tsx clears streamingAssistant once the new
            turn is detected (or never, if detection times out — in which
            case the streamed text remains as the canonical answer). */}
        {(isRunning || streamingAssistant) ? (
          <div className="animate-message-in flex items-start gap-3">
            <AssistantAvatar />
            <div className="flex-1 min-w-0">
              {(isRunning || agentSteps.length > 0) && (
                <AgentSteps steps={agentSteps} isRunning={isRunning} />
              )}
              {streamingAssistant && (
                <div className={isRunning ? "mt-3" : ""}>
                  <MarkdownContent
                    content={streamingAssistant}
                    isStreaming={isRunning}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}

      </div>
      <div ref={bottomRef} className="h-6" />
    </div>
  );
}
