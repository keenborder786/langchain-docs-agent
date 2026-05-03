import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* auto-resize */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const t = text.trim();
      if (!t || disabled) return;
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      await onSend(t);
    },
    [text, disabled, onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const canSend = !disabled && text.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
      <form
        onSubmit={submit}
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm transition-shadow focus-within:border-gray-300 focus-within:shadow-md focus-within:ring-2 focus-within:ring-lc-brand/20"
      >
        {/* attachment/plus button */}
        <button
          type="button"
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Attach"
          tabIndex={-1}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about LangChain..."
          rows={1}
          disabled={disabled}
          className="max-h-[200px] min-h-[28px] flex-1 resize-none bg-transparent py-1 font-ui text-[14px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-50"
        />

        {/* send / loading button */}
        <button
          type="submit"
          disabled={!canSend}
          title={disabled ? "Agent is thinking…" : "Send (Enter)"}
          className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
            disabled
              ? "cursor-default text-gray-300"
              : canSend
                ? "bg-gray-900 text-white shadow-sm hover:bg-gray-700 hover:scale-105 active:scale-95"
                : "text-gray-300 cursor-not-allowed"
          }`}
        >
          {disabled ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" className="opacity-80" />
              <circle cx={12} cy={12} r={10} className="opacity-20" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l7-7 7 7M12 5v14" />
            </svg>
          )}
        </button>
      </form>
      <p className="mx-auto mt-1.5 max-w-3xl text-center font-ui text-[10px] text-gray-400">
        Answers grounded in live LangChain docs via MCP · Shift+Enter for new line
      </p>
    </div>
  );
}
