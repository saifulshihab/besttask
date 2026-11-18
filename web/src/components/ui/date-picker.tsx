import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/cn";

/** "2026-11-21" ⇄ a local Date at midnight, so the calendar never shifts a day by time zone. */
const toDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};
const toKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** "Today", "Tomorrow", "in 3 days", "2 days ago"; null beyond two weeks. */
const relative = (date: Date) => {
  const days = Math.round((date.getTime() - startOfToday().getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 14) return `in ${days} days`;
  if (days < -1 && days >= -14) return `${-days} days ago`;
  return null;
};

const label = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });

const sizes = {
  sm: "h-[34px] px-2.5 text-sm",
  md: "h-[38px] px-3 text-sm",
  /** Phone sheets: matches their 46px, 16px-text inputs. */
  lg: "h-[46px] rounded-xl px-3 text-[16px]",
} as const;

/**
 * Prototype-styled date field: a trigger like the Select's that opens a
 * calendar (react-day-picker, the library behind shadcn's Calendar) in a Base
 * UI popover, with quick picks for common due dates. Values are "YYYY-MM-DD".
 * On phones the quick picks sit above the calendar and days are larger.
 */
export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder = "No date",
  size = "md",
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? toDate(value) : undefined;
  const pick = (date: Date | null) => {
    setOpen(false);
    const next = date ? toKey(date) : null;
    if (next !== value) onChange(next);
  };

  const today = startOfToday();
  // Next Monday; a week from today when today is Monday.
  const nextWeek = addDays(today, ((8 - today.getDay()) % 7) || 7);
  const quick = [
    { name: "Today", date: today },
    { name: "Tomorrow", date: addDays(today, 1) },
    { name: "Next week", date: nextWeek },
  ];
  const hint = selected ? relative(selected) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          "group flex w-full min-w-0 cursor-default items-center gap-2 rounded-md border border-line-strong bg-canvas text-left text-ink outline-none select-none",
          "hover:border-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
          "data-[popup-open]:border-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line-strong",
          sizes[size],
          className,
        )}
      >
        <CalendarDays size={14} aria-hidden className="shrink-0 text-muted" />
        {selected ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate">{label(selected)}</span>
            {hint ? <span className="truncate text-xs text-muted">{hint}</span> : null}
          </span>
        ) : (
          <span className="flex-1 truncate text-faint">{placeholder}</span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[60]">
          <Popover.Popup
            className={cn(
              "flex rounded-lg border border-line bg-canvas shadow-popover outline-none max-sm:w-(--anchor-width) max-sm:flex-col max-sm:rounded-xl",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            <div className="flex w-[120px] flex-col gap-0.5 border-r border-line-soft p-1.5 max-sm:grid max-sm:w-auto max-sm:grid-cols-2 max-sm:gap-1 max-sm:border-r-0 max-sm:border-b">
              {quick.map((q) => (
                <button
                  key={q.name}
                  type="button"
                  onClick={() => pick(q.date)}
                  className="flex flex-col justify-center gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm text-ink outline-none hover:bg-menu-hover focus-visible:bg-menu-hover max-sm:rounded-lg max-sm:bg-menu-hover/60 max-sm:px-3 max-sm:py-2 max-sm:text-[15px]"
                >
                  {q.name}
                  <span className="text-2xs text-muted">
                    {q.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </button>
              ))}
              {value ? (
                <>
                  <span className="my-1 h-px bg-line-soft max-sm:hidden" />
                  <button
                    type="button"
                    onClick={() => pick(null)}
                    className="flex items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted outline-none hover:bg-menu-hover hover:text-ink focus-visible:bg-menu-hover max-sm:rounded-lg max-sm:bg-menu-hover/60 max-sm:px-3 max-sm:text-[15px]"
                  >
                    No date
                  </button>
                </>
              ) : null}
            </div>
            <DayPicker
              mode="single"
              required
              autoFocus
              showOutsideDays
              selected={selected}
              defaultMonth={selected ?? today}
              onSelect={(date) => pick(date)}
              className="p-3 max-sm:self-center"
              classNames={{
                months: "relative flex",
                month: "flex flex-col gap-2",
                month_caption: "flex h-8 items-center pl-1.5 max-sm:h-10",
                caption_label: "text-sm font-semibold text-ink",
                nav: "absolute top-0 right-0 flex h-8 items-center gap-0.5 max-sm:h-10",
                button_previous:
                  "flex size-7 items-center justify-center rounded-sm text-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 max-sm:size-10",
                button_next:
                  "flex size-7 items-center justify-center rounded-sm text-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 max-sm:size-10",
                month_grid: "border-collapse",
                weekdays: "flex",
                weekday: "flex size-8 items-center justify-center text-2xs font-medium text-muted max-sm:w-10",
                weeks: "flex flex-col gap-0.5",
                week: "flex",
                day: "group/day size-8 p-0 text-center max-sm:size-10",
                day_button: cn(
                  "flex size-8 items-center justify-center rounded-md text-sm text-ink outline-none tabular-nums max-sm:size-10 max-sm:text-[15px]",
                  "hover:bg-menu-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                  "group-data-[outside]/day:text-faint",
                  "group-data-[today]/day:font-semibold group-data-[today]/day:text-accent-hover",
                  "group-data-[selected]/day:bg-accent group-data-[selected]/day:font-semibold group-data-[selected]/day:text-white! group-data-[selected]/day:hover:bg-accent-strong",
                ),
                today: "",
                selected: "",
                outside: "",
                hidden: "invisible",
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left" ? <ChevronLeft size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />,
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
