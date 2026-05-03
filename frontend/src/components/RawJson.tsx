import { useMemo, useState } from "react";

export function RawJson({
  value,
  maxHeightClass = "max-h-48",
}: {
  value: unknown;
  maxHeightClass?: string;
}) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <pre
      className={`overflow-auto rounded-md bg-lc-muted/80 px-2 py-1.5 font-mono text-[11px] leading-snug text-lc-ink-muted ${maxHeightClass}`}
    >
      {text}
    </pre>
  );
}

export function RawJsonToggle({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 border-t border-lc-border pt-1">
      <button
        type="button"
        className="text-[11px] font-medium text-lc-deep hover:text-lc-ink"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▼" : "▶"} {label}
      </button>
      {open ? (
        <div className="mt-1">
          <RawJson value={value} />
        </div>
      ) : null}
    </div>
  );
}
