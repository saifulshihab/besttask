import { cn } from "@/lib/cn";
import { labelChipColors, PRIORITIES, STATUSES } from "@/lib/design";
import type { Label, Priority, TaskStatus } from "@/lib/types";

/** Priority with the prototype's three ascending bars; urgent and high are red. */
export function PriorityChip({ priority }: { priority: Priority }) {
  const p = PRIORITIES[priority];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-[5px] rounded-sm border px-[7px] text-xs",
        p.hot
          ? "border-danger-line bg-danger-soft font-medium text-danger-ink"
          : "border-line bg-canvas text-ink-2",
      )}
    >
      <PriorityBars priority={priority} />
      {p.name}
    </span>
  );
}

/**
 * The three ascending bars alone. Filled bars take the text color, empty ones
 * the strong border color: identical to the prototype in light, legible in dark.
 */
export function PriorityBars({ priority, className }: { priority: Priority; className?: string }) {
  const p = PRIORITIES[priority];
  const fill = (n: number) => (p.bars >= n ? "currentColor" : "var(--color-line-strong)");
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden className={cn("shrink-0", className)}>
      <rect x="1" y="9" width="3" height="5" rx="1" fill={fill(1)} />
      <rect x="6.5" y="5" width="3" height="9" rx="1" fill={fill(2)} />
      <rect x="12" y="1" width="3" height="13" rx="1" fill={fill(3)} />
    </svg>
  );
}

/** Priority bars colored as in the chip (red for urgent and high), for option lists. */
export function PriorityIcon({ priority }: { priority: Priority }) {
  return <PriorityBars priority={priority} className={PRIORITIES[priority].hot ? "text-danger" : "text-ink-2"} />;
}

export function LabelChip({ label }: { label: Pick<Label, "name" | "color"> }) {
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-sm px-2 text-xs font-medium"
      style={labelChipColors(label.color)}
    >
      {label.name}
    </span>
  );
}

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("box-border inline-block size-2.5 shrink-0 rounded-full", STATUSES[status].dot, className)}
    />
  );
}

/** The dashed empty avatar the cards use for an unassigned task. */
export function UnassignedIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("box-border inline-block size-[22px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint", className)}
    />
  );
}
