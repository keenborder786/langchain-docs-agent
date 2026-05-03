import { useEffect, useRef, useState } from "react";
import type {
  AgentStep,
  ToolStep,
  SubagentStep,
  TodoState,
} from "@/hooks/useThreadRuns";

/* ── icons ───────────────────────────────────────────────────── */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      <polyline points="3,1 7,5 3,9" />
    </svg>
  );
}

function Spinner({ size = 11 }: { size?: number }) {
  return (
    <svg
      className="animate-spin shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity={0.2} />
      <path strokeLinecap="round" d="M12 2a10 10 0 0110 10" />
    </svg>
  );
}

function CheckDot({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polyline points="1.5,5 4,7.5 8.5,2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-red-500"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ToolGlyph() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-blue-500"
    >
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function AgentGlyph() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-purple-500"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

/* ── TODO panel ─────────────────────────────────────────────── */

function TodoPanel({
  step,
  isRunning,
}: {
  step: TodoState | null;
  isRunning: boolean;
}) {
  const items = step?.items ?? [];
  const total = items.length;
  const done = items.filter((i) => i.status === "completed").length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-200/50">
        <span className="font-ui text-[10px] font-semibold uppercase tracking-widest text-amber-700">
          Tasks
        </span>
        <span className="ml-auto font-ui text-[10px] text-amber-600">
          {total > 0 ? `${done}/${total}` : isRunning ? "planning…" : "no plan"}
        </span>
      </div>
      {total === 0 ? (
        <div className="px-3 py-2 font-ui text-[12px] italic text-amber-700/70">
          {isRunning
            ? "Agent is drafting a plan…"
            : "Agent did not register a plan for this turn."}
        </div>
      ) : (
        <ul className="py-1.5 px-2 space-y-0.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 py-0.5">
              {item.status === "completed" ? (
                <span className="mt-px flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-sm border border-amber-400 bg-amber-400 text-white">
                  <CheckDot size={9} />
                </span>
              ) : item.status === "in_progress" ? (
                <span className="mt-[3px] shrink-0 text-blue-500">
                  <Spinner size={11} />
                </span>
              ) : (
                <span className="mt-px flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-sm border border-gray-300 bg-white" />
              )}
              <span
                className={[
                  "font-ui text-[12px] leading-snug",
                  item.status === "completed"
                    ? "text-gray-400 line-through"
                    : item.status === "in_progress"
                      ? "text-blue-700 font-medium"
                      : "text-gray-600",
                ].join(" ")}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── ToolRow ─────────────────────────────────────────────────── */

const INDENT_PX = 22;

function ToolRow({ step, depth }: { step: ToolStep; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasError = !!step.error;
  const indent = depth * INDENT_PX;

  return (
    <div style={{ paddingLeft: `${indent}px` }} className="relative">
      {/* tree guide line + horizontal connector (when indented) */}
      {depth > 0 && (
        <>
          <span
            className="absolute top-0 bottom-0 w-px bg-purple-200"
            style={{ left: `${indent - 12}px` }}
            aria-hidden
          />
          <span
            className="absolute h-px bg-purple-200"
            style={{ left: `${indent - 12}px`, top: "16px", width: "10px" }}
            aria-hidden
          />
        </>
      )}

      <div
        className={[
          "rounded-md border overflow-hidden",
          hasError ? "border-red-200 bg-red-50/40" : "border-gray-200 bg-white",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="text-gray-300">
            <Chevron open={open} />
          </span>
          <ToolGlyph />
          <span className="flex-1 font-ui text-[12px] text-gray-700 truncate capitalize">
            {step.name}
          </span>
          {hasError ? (
            <AlertIcon />
          ) : step.done ? (
            <span className="text-green-500">
              <CheckDot size={11} />
            </span>
          ) : (
            <Spinner size={11} />
          )}
        </button>

        {open && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {step.input && (
              <div className="px-2.5 py-2">
                <p className="mb-1 font-ui text-[9px] font-bold uppercase tracking-widest text-gray-400">
                  Input
                </p>
                <p className="font-ui text-[12px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">
                  {step.input}
                </p>
              </div>
            )}
            {step.error && (
              <div className="px-2.5 py-2 bg-red-50">
                <p className="mb-1 font-ui text-[9px] font-bold uppercase tracking-widest text-red-500">
                  Error
                </p>
                <p className="font-ui text-[12px] leading-relaxed text-red-700 whitespace-pre-wrap break-words">
                  {step.error}
                </p>
              </div>
            )}
            {step.output && !step.error && (
              <div className="px-2.5 py-2">
                <p className="mb-1 font-ui text-[9px] font-bold uppercase tracking-widest text-green-600">
                  Output
                </p>
                <p className="font-ui text-[12px] leading-relaxed text-gray-600 whitespace-pre-wrap break-words max-h-44 overflow-y-auto">
                  {step.output}
                </p>
              </div>
            )}
            {step.done && !step.output && !step.error && (
              <div className="px-2.5 py-2">
                <p className="font-ui text-[11px] italic text-gray-400">
                  No output captured
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SubagentGroup ───────────────────────────────────────────── */

function SubagentGroup({
  subagent,
  children,
  depth,
}: {
  subagent: SubagentStep;
  children: ToolStep[];
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const [resultOpen, setResultOpen] = useState(false);
  const hasError = !!subagent.error;
  const indent = depth * INDENT_PX;
  const childCount = children.length;
  const errorChildren = children.filter((t) => t.error).length;

  return (
    <div style={{ paddingLeft: `${indent}px` }} className="relative">
      {depth > 0 && (
        <>
          <span
            className="absolute top-0 bottom-0 w-px bg-purple-200"
            style={{ left: `${indent - 12}px` }}
            aria-hidden
          />
          <span
            className="absolute h-px bg-purple-200"
            style={{ left: `${indent - 12}px`, top: "16px", width: "10px" }}
            aria-hidden
          />
        </>
      )}

      <div
        className={[
          "rounded-md border overflow-hidden",
          hasError
            ? "border-red-300 bg-red-50/40"
            : "border-purple-300 bg-purple-50/40",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-purple-100/50 transition-colors"
        >
          <span className="text-purple-400">
            <Chevron open={open} />
          </span>
          <AgentGlyph />
          <span className="font-ui text-[12px] font-semibold text-gray-800 truncate">
            {subagent.name}
          </span>

          {/* Inline child summary so the user sees scope even when collapsed */}
          {childCount > 0 && (
            <span className="font-ui text-[10.5px] text-purple-600/80">
              · {childCount} tool{childCount === 1 ? "" : "s"}
              {errorChildren > 0 && (
                <span className="ml-1 text-red-500">
                  ({errorChildren} failed)
                </span>
              )}
            </span>
          )}

          <span className="ml-auto flex items-center gap-1.5">
            {hasError ? (
              <AlertIcon />
            ) : subagent.done ? (
              <span className="text-green-500">
                <CheckDot size={11} />
              </span>
            ) : (
              <Spinner size={11} />
            )}
          </span>
        </button>

        {/* Collapsible body — when closed, child tools, error & result all
            disappear together. The header above always remains. */}
        {open && (
          <div className="border-t border-purple-200/70 bg-white/60 px-2 py-2 space-y-1.5">
            {/* nested tool calls (right-indented under this subagent) */}
            {childCount > 0 ? (
              children.map((tool) => (
                <ToolRow key={tool.id} step={tool} depth={depth + 1} />
              ))
            ) : !subagent.done ? (
              <p
                style={{ paddingLeft: `${INDENT_PX}px` }}
                className="font-ui text-[11px] italic text-gray-400"
              >
                Working…
              </p>
            ) : (
              <p
                style={{ paddingLeft: `${INDENT_PX}px` }}
                className="font-ui text-[11px] italic text-gray-400"
              >
                No tool calls captured.
              </p>
            )}

            {/* subagent error */}
            {hasError && (
              <div
                style={{ marginLeft: `${INDENT_PX}px` }}
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2"
              >
                <AlertIcon />
                <div>
                  <p className="font-ui text-[10px] font-bold uppercase tracking-widest text-red-500 mb-0.5">
                    Subagent error
                  </p>
                  <p className="font-ui text-[12px] text-red-700 whitespace-pre-wrap break-words">
                    {subagent.error}
                  </p>
                </div>
              </div>
            )}

            {/* subagent final result */}
            {subagent.result && (
              <div
                style={{ marginLeft: `${INDENT_PX}px` }}
                className="relative"
              >
                <span
                  className="absolute top-0 bottom-0 w-px bg-purple-200"
                  style={{ left: `-12px` }}
                  aria-hidden
                />
                <span
                  className="absolute h-px bg-purple-200"
                  style={{ left: `-12px`, top: "16px", width: "10px" }}
                  aria-hidden
                />
                <div className="rounded-md border border-gray-200 bg-gray-50/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setResultOpen((o) => !o)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-100/70 transition-colors"
                  >
                    <span className="text-gray-300">
                      <Chevron open={resultOpen} />
                    </span>
                    <span className="flex-1 font-ui text-[11px] font-medium text-gray-500">
                      Result
                    </span>
                    <span className="text-green-500">
                      <CheckDot size={11} />
                    </span>
                  </button>
                  {resultOpen && (
                    <div className="border-t border-gray-100 px-2.5 py-2">
                      <p className="font-ui text-[12px] leading-relaxed text-gray-600 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                        {subagent.result}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tree builder ────────────────────────────────────────────── */

type TreeNode =
  | { kind: "tool"; step: ToolStep }
  | { kind: "subagent"; step: SubagentStep; children: ToolStep[] };

function buildTree(steps: AgentStep[]): TreeNode[] {
  const childrenByTask = new Map<string, ToolStep[]>();
  for (const s of steps) {
    if (s.type === "tool" && s.parentTaskId) {
      const arr = childrenByTask.get(s.parentTaskId) ?? [];
      arr.push(s);
      childrenByTask.set(s.parentTaskId, arr);
    }
  }
  const tops: TreeNode[] = [];
  for (const s of steps) {
    if (s.type === "tool" && !s.parentTaskId) {
      tops.push({ kind: "tool", step: s });
    } else if (s.type === "subagent") {
      tops.push({
        kind: "subagent",
        step: s,
        children: childrenByTask.get(s.taskId) ?? [],
      });
    }
  }
  return tops;
}

/* ── Root component ──────────────────────────────────────────── */

export function AgentSteps({
  steps,
  isRunning,
  /** When false, the tree is rendered already collapsed (summary-only). */
  defaultExpanded = true,
}: {
  steps: AgentStep[];
  isRunning: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didAutoCollapseRef = useRef(false);

  // Elapsed timer
  useEffect(() => {
    if (isRunning) {
      if (startRef.current === null) startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(
          Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000),
        );
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Reset timer when a new run starts
  useEffect(() => {
    if (isRunning) {
      startRef.current = Date.now();
      setElapsed(0);
      didAutoCollapseRef.current = false;
      setExpanded(true);
    }
  }, [isRunning]);

  // Auto-collapse once the run finishes (only once; user can re-expand freely)
  useEffect(() => {
    if (!isRunning && steps.length > 0 && !didAutoCollapseRef.current) {
      didAutoCollapseRef.current = true;
      setExpanded(false);
    }
  }, [isRunning, steps.length]);

  if (steps.length === 0 && !isRunning) return null;

  const todo = steps.find((s): s is TodoState => s.type === "todo") ?? null;
  const tree = buildTree(steps);
  const stepCount =
    tree.length +
    tree.reduce(
      (acc, n) => acc + (n.kind === "subagent" ? n.children.length : 0),
      0,
    );

  // Show the TODO panel whenever the agent is running, OR when a TODO state
  // was actually emitted during the turn. This guarantees the user always
  // sees the plan area while the agent works.
  const showTodoPanel = isRunning || todo !== null;

  return (
    <div className="mb-3 space-y-2 animate-step-in">
      {/* TODO panel — always visible while agent is running or after a plan was made */}
      {showTodoPanel && <TodoPanel step={todo} isRunning={isRunning} />}

      {/* Status / collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-1.5 text-left hover:bg-gray-100/70 transition-colors"
      >
        {isRunning ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-lc-deep animate-pulse" />
            <span className="font-ui text-[11px] font-medium text-gray-600">
              Thinking…
            </span>
          </>
        ) : (
          <>
            <span className="text-green-500">
              <CheckDot size={11} />
            </span>
            <span className="font-ui text-[11px] font-medium text-gray-600">
              Thought for {elapsed}s
            </span>
          </>
        )}
        {stepCount > 0 && (
          <span className="font-ui text-[10px] text-gray-400">
            · {stepCount} step{stepCount === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto text-gray-400">
          <Chevron open={expanded} />
        </span>
      </button>

      {/* Tree */}
      {expanded && tree.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          {tree.map((node) => {
            if (node.kind === "tool") {
              return <ToolRow key={node.step.id} step={node.step} depth={0} />;
            }
            return (
              <SubagentGroup
                key={node.step.id}
                subagent={node.step}
                children={node.children}
                depth={0}
              />
            );
          })}
        </div>
      )}

      {expanded && tree.length === 0 && isRunning && (
        <p className="px-3 font-ui text-[11px] italic text-gray-400">
          Working…
        </p>
      )}
    </div>
  );
}
