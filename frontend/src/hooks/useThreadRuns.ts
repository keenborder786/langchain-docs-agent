import { useCallback, useMemo, useRef, useState } from "react";
import { langgraphClient } from "@/lib/langgraphClient";
import { DEFAULT_STREAM_MODES, GRAPH_ASSISTANT_ID } from "@/lib/constants";

/* ── Types ───────────────────────────────────────────────────── */

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ToolStep {
  type: "tool";
  id: string;
  runId: string;
  ts: number;
  name: string;
  input?: string;
  output?: string;
  done: boolean;
  error?: string;
  /** undefined = main agent; a taskId = belongs to that subagent */
  parentTaskId?: string;
}

export interface SubagentStep {
  type: "subagent";
  id: string;
  taskId: string;
  ts: number;
  name: string;
  result?: string;
  done: boolean;
  error?: string;
}

export interface TodoState {
  type: "todo";
  id: string;
  ts: number;
  items: TodoItem[];
}

export type AgentStep = ToolStep | SubagentStep | TodoState;

/** Per-thread run state. Each open thread can have its own slice running
 *  independently; switching threads in the UI just selects a different slice. */
export interface ThreadRunState {
  streamingAssistant: string;
  agentSteps: AgentStep[];
  isRunning: boolean;
  error: string | null;
}

export const EMPTY_RUN_STATE: ThreadRunState = {
  streamingAssistant: "",
  agentSteps: [],
  isRunning: false,
  error: null,
};

/* ── Helpers ─────────────────────────────────────────────────── */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function cleanTaskName(raw: string): string {
  const withoutUUID = raw
    .replace(new RegExp(UUID_RE.source, "gi"), "")
    .replace(/:$/, "")
    .replace(/\|$/, "");
  return withoutUUID.split("|").pop()?.trim() || "";
}

const SUBAGENT_LABELS: Record<string, string> = {
  "langchain-expert": "LangChain Expert",
  "langgraph-expert": "LangGraph Expert",
  "langsmith-expert": "LangSmith Expert",
  "deepagents-expert": "Deep Agents Expert",
  "quality-control": "Quality Control",
  "forum-researcher": "Forum Researcher",
  "general-purpose": "General Purpose",
};

function subagentDisplayName(clean: string): string {
  return (
    SUBAGENT_LABELS[clean] ??
    clean.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function randomId(): string {
  return (
    crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function mergeStreamText(prev: string, next: string): string {
  if (!next) return prev;
  if (!prev) return next;
  if (next.startsWith(prev)) return next;
  if (prev.endsWith(next)) return prev;
  return prev + next;
}

/**
 * Detect if a string is actually a serialized Anthropic tool_use block.
 * Raw tool_use JSON sometimes leaks into `content` through middleware;
 * we strip it here so nothing like {"type":"tool_use","partial_json":"…"}
 * reaches the chat bubble.
 */
export function looksLikeToolUseJson(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  return (
    /"type"\s*:\s*"tool_use"/.test(t) ||
    /"partial_json"/.test(t) ||
    /"tool_use_id"/.test(t) ||
    /toolu_[a-zA-Z0-9]+/.test(t)
  );
}

function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const c = (msg as { content?: unknown }).content;
  if (typeof c === "string") {
    return looksLikeToolUseJson(c) ? "" : c;
  }
  if (Array.isArray(c)) {
    return c
      .map((b) => {
        if (typeof b === "string") {
          return looksLikeToolUseJson(b) ? "" : b;
        }
        if (!b || typeof b !== "object") return "";
        const bl = b as Record<string, unknown>;
        return bl.type === "text" && typeof bl.text === "string" ? bl.text : "";
      })
      .join("");
  }
  return "";
}

function extractOutputText(raw: unknown, max = 800): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > max ? t.slice(0, max) + "…" : t;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      const parts = (obj.content as unknown[])
        .map((b) => {
          if (!b || typeof b !== "object") return "";
          const bl = b as Record<string, unknown>;
          return bl.type === "text" && typeof bl.text === "string"
            ? (bl.text as string).trim()
            : "";
        })
        .filter(Boolean);
      const joined = parts.join("\n\n");
      return joined.length > max ? joined.slice(0, max) + "…" : joined;
    }
    if (typeof obj.text === "string") {
      const t = obj.text.trim();
      return t.length > max ? t.slice(0, max) + "…" : t;
    }
    if (obj.output !== undefined) return extractOutputText(obj.output, max);
    if (typeof obj.error === "string") return `Error: ${obj.error}`;
  }
  return "";
}

function extractInputText(raw: unknown, max = 500): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > max ? t.slice(0, max) + "…" : t;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of [
      "query",
      "command",
      "cmd",
      "path",
      "input",
      "text",
      "description",
    ]) {
      if (typeof obj[key] === "string") {
        const t = (obj[key] as string).trim();
        return t.length > max ? t.slice(0, max) + "…" : t;
      }
    }
    const entries = Object.entries(obj)
      .filter(([k]) => k !== "tool_call_id")
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n");
    return entries.length > max ? entries.slice(0, max) + "…" : entries;
  }
  return String(raw);
}

/** Per-thread mutable parsing context — kept out of React state because it
 *  changes thousands of times per run and only matters to the streaming
 *  loop, never to the rendered UI. */
interface ThreadRefs {
  toolRunMap: Map<string, string>;
  todoStepId: string | null;
  subagentRunIds: Set<string>;
}

function newThreadRefs(): ThreadRefs {
  return {
    toolRunMap: new Map(),
    todoStepId: null,
    subagentRunIds: new Set(),
  };
}

/* ── Hook ────────────────────────────────────────────────────── */

/**
 * Manage parallel agent runs across multiple threads. Each thread gets its
 * own isolated run state (streaming text, agent steps, error, isRunning).
 * Switching threads in the UI just reads a different slice — no leakage.
 *
 * Multiple threads can have a run in flight simultaneously; each one
 * streams independently and updates only its own slice.
 */
export function useThreadRuns(
  onComplete?: (threadId: string) => void | Promise<void>,
) {
  const [runs, setRuns] = useState<Record<string, ThreadRunState>>({});
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const threadRefs = useRef<Map<string, ThreadRefs>>(new Map());

  const updateRun = useCallback(
    (threadId: string, updater: (prev: ThreadRunState) => ThreadRunState) => {
      setRuns((prev) => {
        const current = prev[threadId] ?? EMPTY_RUN_STATE;
        const next = updater(current);
        if (next === current) return prev;
        return { ...prev, [threadId]: next };
      });
    },
    [],
  );

  const setSteps = useCallback(
    (threadId: string, updater: (prev: AgentStep[]) => AgentStep[]) => {
      updateRun(threadId, (s) => {
        const nextSteps = updater(s.agentSteps);
        if (nextSteps === s.agentSteps) return s;
        return { ...s, agentSteps: nextSteps };
      });
    },
    [updateRun],
  );

  const sendMessage = useCallback(
    async (threadId: string, userText: string) => {
      // Cancel any active run already on this thread (rare, but safe).
      const existing = abortControllers.current.get(threadId);
      if (existing) existing.abort();

      const ac = new AbortController();
      abortControllers.current.set(threadId, ac);
      threadRefs.current.set(threadId, newThreadRefs());

      // Reset this thread's slice — old thinking/steps disappear immediately
      // when a new message starts.
      setRuns((prev) => ({
        ...prev,
        [threadId]: {
          streamingAssistant: "",
          agentSteps: [],
          isRunning: true,
          error: null,
        },
      }));

      try {
        const stream = langgraphClient.runs.stream(
          threadId,
          GRAPH_ASSISTANT_ID,
          {
            input: { messages: [{ type: "human", content: userText }] },
            streamMode: [...DEFAULT_STREAM_MODES],
            streamSubgraphs: true,
            signal: ac.signal,
            // The LangGraph SDK defaults recursion_limit to 25 if not passed,
            // which is trivially exceeded by the multi-step orchestration
            // (plan → 2+ subagents → quality-control → forum-research →
            // final answer). Set a large value here to prevent
            // GraphRecursionError from crashing runs silently.
            config: { recursion_limit: 11_000 },
          },
        );

        for await (const part of stream) {
          const ev = part.event as string;
          const data = part.data;
          const refs = threadRefs.current.get(threadId);
          if (!refs) break; // thread refs were cleared (cancellation race)

          /* ── FATAL: graph-level error event ───────────────────── */
          if (ev === "error" || ev.startsWith("error|")) {
            const errPayload = data as
              | { error?: string; message?: string }
              | string
              | undefined;
            const msg =
              typeof errPayload === "string"
                ? errPayload
                : [errPayload?.error, errPayload?.message]
                    .filter(Boolean)
                    .join(": ") || "The agent run failed.";
            updateRun(threadId, (s) => ({ ...s, error: msg }));
            break;
          }

          /* ── streaming assistant text ─────────────────────── */
          if (ev === "messages" || ev.startsWith("messages")) {
            if (ev === "messages") {
              const tuple = data as unknown;
              if (Array.isArray(tuple) && tuple.length >= 1) {
                const msg = tuple[0];
                if (
                  msg &&
                  typeof msg === "object" &&
                  "type" in msg &&
                  (msg as { type: string }).type === "ai"
                ) {
                  const text = extractTextFromMessage(msg);
                  if (text) {
                    updateRun(threadId, (s) => ({
                      ...s,
                      streamingAssistant: mergeStreamText(
                        s.streamingAssistant,
                        text,
                      ),
                    }));
                  }
                }
              }
            } else if (
              ev === "messages/partial" ||
              ev === "messages/complete"
            ) {
              const arr = data as unknown;
              if (Array.isArray(arr)) {
                for (const msg of arr) {
                  if (
                    msg &&
                    typeof msg === "object" &&
                    "type" in msg &&
                    (msg as { type: string }).type === "ai"
                  ) {
                    const text = extractTextFromMessage(msg);
                    if (text) {
                      updateRun(threadId, (s) => ({
                        ...s,
                        streamingAssistant: mergeStreamText(
                          s.streamingAssistant,
                          text,
                        ),
                      }));
                    }
                  }
                }
              }
            }
            continue;
          }

          /* ── authoritative TODO list from values stream ──── */
          if (ev === "values") {
            const v = data as { todos?: unknown };
            if (Array.isArray(v.todos) && v.todos.length > 0) {
              const rawTodos = v.todos as Array<Record<string, unknown>>;
              setSteps(threadId, (prev) => {
                const todoId = refs.todoStepId ?? randomId();
                if (!refs.todoStepId) refs.todoStepId = todoId;

                const items: TodoItem[] = rawTodos.map((t, i) => ({
                  id: `todo-${i}-${String(t.content ?? "").slice(0, 20)}`,
                  text:
                    typeof t.content === "string"
                      ? t.content
                      : String(t.content ?? ""),
                  status: (["pending", "in_progress", "completed"].includes(
                    String(t.status),
                  )
                    ? t.status
                    : "pending") as TodoItem["status"],
                }));

                return [
                  ...prev.filter((s) => !(s.type === "todo" && s.id === todoId)),
                  { type: "todo", id: todoId, ts: Date.now(), items },
                ];
              });
            }
            continue;
          }

          /* ── tool calls (main + subgraph) ─────────────────── */
          if (ev === "events" || ev.startsWith("events|")) {
            const payload = data as {
              event?: string;
              name?: string;
              run_id?: string;
              parent_ids?: string[];
              parentIds?: string[];
              metadata?: Record<string, unknown>;
              data?: unknown;
            };
            const innerEvent = payload.event ?? "";
            const toolName = payload.name ?? "tool";
            const runId = payload.run_id ?? "";

            const parentIds: string[] =
              (Array.isArray(payload.parent_ids) && payload.parent_ids) ||
              (Array.isArray(payload.parentIds) && payload.parentIds) ||
              [];
            let parentTaskId: string | undefined;
            for (let pi = parentIds.length - 1; pi >= 0; pi--) {
              if (refs.subagentRunIds.has(parentIds[pi])) {
                parentTaskId = parentIds[pi];
                break;
              }
            }

            /* Deep-agents `task` tool = subagent invocation. */
            if (innerEvent === "on_tool_start" && toolName === "task") {
              const inputData =
                (payload.data as { input?: unknown })?.input ?? payload.data;
              const inputObj =
                inputData && typeof inputData === "object"
                  ? (inputData as Record<string, unknown>)
                  : {};
              const subagentType =
                typeof inputObj.subagent_type === "string"
                  ? (inputObj.subagent_type as string)
                  : "subagent";

              refs.subagentRunIds.add(runId);

              setSteps(threadId, (prev) => [
                ...prev,
                {
                  type: "subagent",
                  id: randomId(),
                  taskId: runId,
                  ts: Date.now(),
                  name: subagentDisplayName(cleanTaskName(subagentType)),
                  result: undefined,
                  done: false,
                } satisfies SubagentStep,
              ]);
              continue;
            }

            if (innerEvent === "on_tool_end" && toolName === "task") {
              const rawOutput =
                (payload.data as { output?: unknown })?.output ?? payload.data;
              const outputText = extractOutputText(rawOutput, 1200);
              const errorText =
                rawOutput &&
                typeof rawOutput === "object" &&
                typeof (rawOutput as Record<string, unknown>).error === "string"
                  ? ((rawOutput as Record<string, unknown>).error as string)
                  : undefined;

              setSteps(threadId, (prev) =>
                prev.map((s) =>
                  s.type === "subagent" && s.taskId === runId
                    ? {
                        ...s,
                        result: outputText || s.result,
                        done: true,
                        error: errorText,
                      }
                    : s,
                ),
              );
              refs.subagentRunIds.delete(runId);
              continue;
            }

            if (innerEvent === "on_tool_start") {
              // Hide write_todos as a tool row — it drives the TODO panel.
              if (/write_?todos?/i.test(toolName)) {
                const inputData =
                  (payload.data as { input?: unknown })?.input ?? payload.data;
                const inputObj =
                  inputData && typeof inputData === "object"
                    ? (inputData as Record<string, unknown>)
                    : {};
                const rawTodos = Array.isArray(inputObj.todos)
                  ? (inputObj.todos as Array<Record<string, unknown>>)
                  : null;
                if (rawTodos && rawTodos.length > 0) {
                  setSteps(threadId, (prev) => {
                    const todoId = refs.todoStepId ?? randomId();
                    if (!refs.todoStepId) refs.todoStepId = todoId;
                    const items: TodoItem[] = rawTodos.map((t, i) => ({
                      id: `todo-${i}-${String(t.content ?? "").slice(0, 20)}`,
                      text:
                        typeof t.content === "string"
                          ? t.content
                          : String(t.content ?? ""),
                      status: (["pending", "in_progress", "completed"].includes(
                        String(t.status),
                      )
                        ? t.status
                        : "pending") as TodoItem["status"],
                    }));
                    return [
                      ...prev.filter(
                        (s) => !(s.type === "todo" && s.id === todoId),
                      ),
                      { type: "todo", id: todoId, ts: Date.now(), items },
                    ];
                  });
                }
                continue;
              }

              const inputData =
                (payload.data as { input?: unknown })?.input ?? payload.data;
              const inputStr = extractInputText(inputData);
              const stepId = randomId();
              refs.toolRunMap.set(runId, stepId);

              const step: ToolStep = {
                type: "tool",
                id: stepId,
                runId,
                ts: Date.now(),
                name: toolName.replace(/_/g, " "),
                input: inputStr || undefined,
                done: false,
                parentTaskId,
              };
              setSteps(threadId, (prev) => [...prev, step]);
              continue;
            }

            if (innerEvent === "on_tool_end") {
              const rawOutput =
                (payload.data as { output?: unknown })?.output ?? payload.data;
              const errorText =
                rawOutput &&
                typeof rawOutput === "object" &&
                (typeof (rawOutput as Record<string, unknown>).error ===
                  "string"
                  ? ((rawOutput as Record<string, unknown>).error as string)
                  : (rawOutput as Record<string, unknown>).status === "error"
                    ? extractOutputText(rawOutput)
                    : undefined);
              const outputStr = extractOutputText(rawOutput);
              const stepId = refs.toolRunMap.get(runId);
              if (stepId) {
                setSteps(threadId, (prev) =>
                  prev.map((s) =>
                    s.type === "tool" && s.id === stepId
                      ? {
                          ...s,
                          output: outputStr || undefined,
                          done: true,
                          error:
                            typeof errorText === "string"
                              ? errorText
                              : undefined,
                        }
                      : s,
                  ),
                );
                refs.toolRunMap.delete(runId);
              }
              continue;
            }

            /* ── on_tool_error: tool raised an exception that escaped the
               tool wrapper. */
            if (innerEvent === "on_tool_error") {
              const rawErr = (payload.data as { error?: unknown })?.error;
              const errMsg =
                typeof rawErr === "string"
                  ? rawErr
                  : rawErr && typeof rawErr === "object"
                    ? (rawErr as { message?: string }).message ??
                      JSON.stringify(rawErr).slice(0, 400)
                    : "Tool raised an exception";

              if (toolName === "task") {
                setSteps(threadId, (prev) =>
                  prev.map((s) =>
                    s.type === "subagent" && s.taskId === runId
                      ? { ...s, done: true, error: errMsg }
                      : s,
                  ),
                );
                refs.subagentRunIds.delete(runId);
                continue;
              }
              const stepId = refs.toolRunMap.get(runId);
              if (stepId) {
                setSteps(threadId, (prev) =>
                  prev.map((s) =>
                    s.type === "tool" && s.id === stepId
                      ? { ...s, done: true, error: errMsg }
                      : s,
                  ),
                );
                refs.toolRunMap.delete(runId);
              }
              continue;
            }

            /* ── on_chain_error: a graph node / runnable crashed. */
            if (innerEvent === "on_chain_error") {
              const rawErr = (payload.data as { error?: unknown })?.error;
              const errMsg =
                typeof rawErr === "string"
                  ? rawErr
                  : rawErr && typeof rawErr === "object"
                    ? (rawErr as { message?: string }).message ??
                      JSON.stringify(rawErr).slice(0, 400)
                    : "A graph node failed";

              const subagentTaskId =
                parentTaskId ??
                (refs.subagentRunIds.has(runId) ? runId : undefined);

              if (subagentTaskId) {
                setSteps(threadId, (prev) =>
                  prev.map((s) =>
                    s.type === "subagent" && s.taskId === subagentTaskId
                      ? { ...s, done: true, error: errMsg }
                      : s,
                  ),
                );
                refs.subagentRunIds.delete(subagentTaskId);
              } else {
                updateRun(threadId, (s) => ({
                  ...s,
                  error: s.error ?? errMsg,
                }));
              }
              continue;
            }
            continue;
          }

          /* ── tasks stream (only the error variant matters) ─── */
          if (ev === "tasks" || ev.startsWith("tasks|")) {
            const t = data as { id?: string; error?: unknown };
            const tId = typeof t.id === "string" ? t.id : "";
            const rawErr = t.error;
            if (rawErr === undefined || rawErr === null) continue;

            const errMsg =
              typeof rawErr === "string"
                ? rawErr
                : rawErr && typeof rawErr === "object"
                  ? (rawErr as { message?: string }).message ??
                    JSON.stringify(rawErr).slice(0, 400)
                  : String(rawErr);

            if (tId && refs.subagentRunIds.has(tId)) {
              setSteps(threadId, (prev) =>
                prev.map((s) =>
                  s.type === "subagent" && s.taskId === tId
                    ? { ...s, done: true, error: errMsg }
                    : s,
                ),
              );
              refs.subagentRunIds.delete(tId);
            } else {
              updateRun(threadId, (s) => ({
                ...s,
                error: s.error ?? errMsg,
              }));
            }
            continue;
          }
        }

        // CRITICAL: do NOT clear streamingAssistant here. The remote thread
        // state may not yet have the new assistant message when the stream
        // ends. The consumer is responsible for polling until the new turn
        // appears in remote state, then calling clearStreamingForThread.
        await onComplete?.(threadId);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          updateRun(threadId, (s) => ({ ...s, error: null }));
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          updateRun(threadId, (s) => ({ ...s, error: msg }));
        }
      } finally {
        updateRun(threadId, (s) => ({ ...s, isRunning: false }));
        if (abortControllers.current.get(threadId) === ac) {
          abortControllers.current.delete(threadId);
        }
      }
    },
    [onComplete, updateRun, setSteps],
  );

  const cancel = useCallback((threadId: string) => {
    abortControllers.current.get(threadId)?.abort();
    abortControllers.current.delete(threadId);
  }, []);

  const clearStreamingForThread = useCallback(
    (threadId: string) => {
      updateRun(threadId, (s) => ({ ...s, streamingAssistant: "" }));
    },
    [updateRun],
  );

  const clearRunForThread = useCallback(
    (threadId: string) => {
      // Abort any in-flight stream on this thread first. Without this,
      // deleting a thread mid-run leaves the SSE consumer alive trying
      // to write into a thread that no longer exists on the server.
      const ac = abortControllers.current.get(threadId);
      if (ac) {
        ac.abort();
        abortControllers.current.delete(threadId);
      }
      threadRefs.current.delete(threadId);
      setRuns((prev) => {
        if (!(threadId in prev)) return prev;
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
    },
    [],
  );

  const getRunState = useCallback(
    (threadId: string | null): ThreadRunState => {
      if (!threadId) return EMPTY_RUN_STATE;
      return runs[threadId] ?? EMPTY_RUN_STATE;
    },
    [runs],
  );

  const runningThreadIds = useMemo(() => {
    const s = new Set<string>();
    for (const [tid, state] of Object.entries(runs)) {
      if (state.isRunning) s.add(tid);
    }
    return s;
  }, [runs]);

  return {
    sendMessage,
    cancel,
    getRunState,
    runningThreadIds,
    clearStreamingForThread,
    clearRunForThread,
  };
}
