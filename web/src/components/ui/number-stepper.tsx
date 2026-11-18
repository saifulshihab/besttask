import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * − [n] + control. Typing is allowed too: the value is clamped to min–max and
 * saved on blur or Enter. When `emptyAt` is set, that value shows as the
 * `emptyLabel` placeholder (e.g. 0 → "None") and clearing the field returns to it.
 */
export function NumberStepper({
  value,
  min,
  max,
  onChange,
  label,
  decrementLabel = "Decrease",
  incrementLabel = "Increase",
  emptyAt,
  emptyLabel,
  id,
  className,
  inputClassName,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** Accessible name of the number field. */
  label: string;
  decrementLabel?: string;
  incrementLabel?: string;
  emptyAt?: number;
  emptyLabel?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
}) {
  const shown = (n: number) => (emptyAt !== undefined && n === emptyAt ? "" : String(n));
  const [draft, setDraft] = useState(shown(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(shown(value));
  }
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = () => {
    const typed = Number.parseInt(draft, 10);
    const next = Number.isNaN(typed) ? (draft.trim() === "" && emptyAt !== undefined ? emptyAt : value) : clamp(typed);
    setDraft(shown(next));
    if (next !== value) onChange(next);
  };
  const step =
    "flex w-8 items-center justify-center text-muted outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <span
      className={cn(
        "flex h-8 shrink-0 overflow-hidden rounded-md border border-line-strong bg-canvas focus-within:border-accent",
        className,
      )}
    >
      <button type="button" aria-label={decrementLabel} disabled={value <= min} onClick={() => onChange(clamp(value - 1))} className={step}>
        <Minus size={14} aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        placeholder={emptyLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={cn(
          "w-11 [appearance:textfield] border-x border-line-strong bg-transparent text-center text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-faint",
          "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          inputClassName,
        )}
      />
      <button type="button" aria-label={incrementLabel} disabled={value >= max} onClick={() => onChange(clamp(value + 1))} className={step}>
        <Plus size={14} aria-hidden />
      </button>
    </span>
  );
}
