import { useState } from "react";
import type { Thread } from "@langchain/langgraph-sdk";
import { DEFAULT_CONVERSATION_TITLE } from "@/lib/constants";

function threadTitle(t: Thread): string {
  const meta = t.metadata as Record<string, unknown> | undefined;
  const title = meta?.title;
  return typeof title === "string" && title.trim() ? title : DEFAULT_CONVERSATION_TITLE;
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "";
  }
}

function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3 pb-1 pt-3">
      <span className="font-ui text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        {children}
      </span>
    </div>
  );
}

/**
 * Animated progression dot shown next to threads with an in-flight run.
 * Three concentric pulsing rings on a solid blue dot — clearly conveys
 * "still working" without taking up space.
 */
function ProgressionDot() {
  return (
    <span
      className="relative flex h-2 w-2 shrink-0 items-center justify-center"
      title="Agent is working…"
      aria-label="Agent is working"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lc-brand opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-lc-brand" />
    </span>
  );
}

export function Sidebar({
  threads,
  selectedId,
  loading,
  runningThreadIds,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  threads: Thread[];
  selectedId: string | null;
  loading: boolean;
  runningThreadIds: Set<string>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (threadId: string, title: string) => void | Promise<void>;
  onDelete: (threadId: string) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = threads.filter((t) =>
    threadTitle(t).toLowerCase().includes(search.toLowerCase()),
  );
  const todayThreads = filtered.filter((t) => isToday(t.updated_at));
  const olderThreads = filtered.filter((t) => !isToday(t.updated_at));

  function renderItem(t: Thread) {
    const active = t.thread_id === selectedId;
    const title = threadTitle(t);
    const isConfirming = confirmDeleteId === t.thread_id;
    const isRunning = runningThreadIds.has(t.thread_id);

    if (editingId === t.thread_id) {
      return (
        <li key={t.thread_id}>
          <form
            className="flex gap-1 px-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              void onRename(t.thread_id, editValue.trim() || DEFAULT_CONVERSATION_TITLE);
              setEditingId(null);
            }}
          >
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setEditingId(null); }}
              className="flex-1 rounded-md border border-lc-brand bg-white px-2 py-1 font-ui text-xs outline-none"
            />
            <button type="submit" className="font-ui text-xs font-semibold text-lc-deep hover:underline">
              Save
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="font-ui text-xs text-gray-400 hover:text-gray-600">✕</button>
          </form>
        </li>
      );
    }

    if (isConfirming) {
      return (
        <li key={t.thread_id} className="animate-fade-in px-2 py-1">
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <span className="flex-1 font-ui text-[11px] text-red-700">Delete conversation?</span>
            <button
              type="button"
              onClick={() => { setConfirmDeleteId(null); void onDelete(t.thread_id); }}
              className="rounded-md bg-red-600 px-2 py-0.5 font-ui text-[11px] font-semibold text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="font-ui text-[11px] text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </li>
      );
    }

    return (
      <li key={t.thread_id} className="group relative">
        <button
          type="button"
          onClick={() => onSelect(t.thread_id)}
          className={`w-full rounded-lg px-3 py-2 text-left transition-colors duration-100 pr-14 ${
            active ? "bg-gray-100 font-semibold" : "hover:bg-gray-100/70"
          }`}
        >
          <div className="flex items-center gap-2">
            {isRunning && <ProgressionDot />}
            <div className="min-w-0 flex-1 font-ui text-[13px] leading-snug text-gray-800 line-clamp-1">
              {title}
            </div>
          </div>
          <div className="mt-0.5 font-ui text-[11px] text-gray-400">
            {isRunning ? (
              <span className="text-lc-deep">Working…</span>
            ) : (
              timeAgo(t.updated_at)
            )}
          </div>
        </button>
        {/* action icons on hover */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Rename"
            onClick={(e) => { e.stopPropagation(); setEditingId(t.thread_id); setEditValue(title); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2a2 2 0 01.586-1.414z" />
            </svg>
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.thread_id); }}
            className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </li>
    );
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-gray-200 bg-gray-50/60">
      {/* search */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm focus-within:border-lc-brand/60 focus-within:ring-2 focus-within:ring-lc-brand/20 transition-all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads..."
            className="flex-1 bg-transparent font-ui text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* thread list */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading && threads.length === 0 ? (
          <div className="space-y-1.5 px-3 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-gray-200/60 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <p className="px-4 py-4 font-ui text-[12px] text-gray-400">
            {search ? `No results for "${search}"` : "No conversations yet."}
          </p>
        ) : null}

        {todayThreads.length > 0 && (
          <>
            <SectionLabel>Today</SectionLabel>
            <ul className="space-y-0.5 px-2">{todayThreads.map(renderItem)}</ul>
          </>
        )}

        {olderThreads.length > 0 && (
          <>
            <SectionLabel>Older</SectionLabel>
            <ul className="space-y-0.5 px-2">{olderThreads.map(renderItem)}</ul>
          </>
        )}

        {/* new conversation shortcut at bottom */}
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 font-ui text-[12px] text-gray-400 transition-colors hover:border-lc-brand hover:bg-lc-muted/30 hover:text-lc-deep"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            New conversation
          </button>
        </div>
      </div>
    </aside>
  );
}
