import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ArrowUpDown, Check, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SearchClear } from "@/components/ui/field";
import { MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/design";
import { hasFilters, SORTS, type SortId, type TaskSearch } from "@/lib/task-filters";
import type { Label, Priority } from "@/lib/types";

type ArrayKey = "status" | "priority" | "assignee" | "label";

interface Option {
  id: string;
  name: string;
  dot?: string;
}

const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

/**
 * Search, filter chips, task count and sort for the board and list views
 * (prototype toolbar). Filters are URL state; the caller applies `onChange`.
 */
export function TaskToolbar({
  search,
  onChange,
  labels,
  shown,
  total,
  leading,
  beforeSort,
  afterSort,
}: {
  search: TaskSearch;
  onChange: (patch: Partial<TaskSearch>) => void;
  labels: Label[];
  shown: number;
  total: number;
  /** List-view extras, in the prototype's order: Views ▾ before search, */
  leading?: ReactNode;
  /** Show subtasks before Sort, */
  beforeSort?: ReactNode;
  /** and Save view after it. */
  afterSort?: ReactNode;
}) {
  const filtering = hasFilters(search);
  const filters: { key: ArrayKey; label: string; options: Option[]; empty?: string }[] = [
    {
      key: "status",
      label: "Status",
      options: STATUS_ORDER.map((s) => ({ id: s, name: STATUSES[s].name, dot: STATUSES[s].dot })),
    },
    {
      key: "assignee",
      label: "Assignee",
      options: [
        { id: "me", name: "Me" },
        { id: "none", name: "Unassigned" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      options: PRIORITY_ORDER.map((p) => ({ id: p, name: PRIORITIES[p].name })),
    },
    {
      key: "label",
      label: "Label",
      options: labels.map((l) => ({ id: l.id, name: l.name })),
      empty: "No labels in this project yet. Add them in project settings.",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-7 py-3">
      {leading}
      <SearchInput value={search.q ?? ""} onChange={(q) => onChange({ q: q || undefined })} />
      {filters.map((f) => (
        <FilterChip
          key={f.key}
          label={f.label}
          options={f.options}
          empty={f.empty}
          selected={(search[f.key] as string[] | undefined) ?? []}
          onChange={(ids) => onChange({ [f.key]: ids.length ? ids : undefined })}
        />
      ))}
      {filtering ? (
        <button
          type="button"
          onClick={() =>
            onChange({ q: undefined, status: undefined, priority: undefined, assignee: undefined, label: undefined })
          }
          className="h-8 rounded-md px-2.5 text-sm font-medium text-accent-hover hover:bg-hover"
        >
          Clear all
        </button>
      ) : null}
      <span className="flex-1" />
      <span className="text-xs text-muted" aria-live="polite">
        {filtering ? `${shown} of ${total} tasks` : `${total} task${total === 1 ? "" : "s"}`}
      </span>
      {beforeSort}
      <SortMenu value={search.sort ?? "priority"} onChange={(sort) => onChange({ sort: sort === "priority" ? undefined : sort })} />
      {afterSort}
    </div>
  );
}

/** Filters as you type; the URL is updated after a short pause. */
function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // What this input last pushed to the URL. When the URL catches up to it,
  // keep the text as is: the user may have typed more in the meantime.
  const [sent, setSent] = useState(value);
  // Follow outside changes, such as "Clear all" or Back.
  if (value !== synced) {
    setSynced(value);
    if (value !== sent) setText(value);
  }
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => {
      setSent(text);
      latest.current(text);
    }, 150);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    // Prototype widths are content-box (340px + padding + border = 362px).
    <label className="flex h-8 max-w-[362px] min-w-[222px] flex-[1_1_262px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-muted focus-within:border-accent">
      <Search size={14} aria-hidden />
      <span className="sr-only">Filter tasks</span>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Filter by title or description"
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
      {text ? <SearchClear onClear={() => setText("")} className="-mr-1" /> : null}
    </label>
  );
}

function FilterChip({
  label,
  options,
  selected,
  empty,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  empty?: string;
  onChange: (ids: string[]) => void;
}) {
  const names = options.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const active = selected.length > 0;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const menu = (
    <MenuPopup>
      {options.map((o) => (
        <BaseMenu.CheckboxItem
          key={o.id}
          checked={selected.includes(o.id)}
          onCheckedChange={() => toggle(o.id)}
          className="group flex min-h-[34px] w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm text-ink outline-none select-none data-[highlighted]:bg-menu-hover"
        >
          <span className="box-border flex size-4 items-center justify-center rounded-[4px] border-[1.5px] border-faint bg-canvas group-data-[checked]:border-accent group-data-[checked]:bg-accent">
            <Check size={11} strokeWidth={3.4} className="text-white" aria-hidden />
          </span>
          {o.dot ? <span aria-hidden className={cn("box-border size-2.5 shrink-0 rounded-full", o.dot)} /> : null}
          <span className="flex-1">{o.name}</span>
        </BaseMenu.CheckboxItem>
      ))}
      {options.length === 0 && empty ? (
        <span className="max-w-[240px] px-2.5 py-1.5 text-xs text-muted">{empty}</span>
      ) : null}
    </MenuPopup>
  );

  // One menu instance for both looks, so picking the first value (which turns
  // the chip active) does not remount and close the open menu.
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-md",
        active && "bg-accent-soft text-sm font-medium text-accent-ink",
      )}
    >
      <MenuRoot>
        <MenuTrigger
          className={
            active
              ? "h-8 rounded-l-md border-0 bg-transparent pr-1 pl-2.5 text-sm font-medium text-accent-ink"
              : "inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-faint bg-canvas pr-2.5 pl-2 text-sm text-ink-2 hover:bg-hover"
          }
        >
          {active ? (
            names.length > 1 ? `${label} · ${names.length}` : `${label}: ${names[0]}`
          ) : (
            <>
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              {label}
            </>
          )}
        </MenuTrigger>
        {menu}
      </MenuRoot>
      {active ? (
        <button
          type="button"
          aria-label={`Clear ${label} filter`}
          onClick={() => onChange([])}
          className="inline-flex size-7 items-center justify-center rounded-sm text-accent-ink hover:bg-[#DCDAF5]"
        >
          <X size={12} strokeWidth={2.6} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function SortMenu({ value, onChange }: { value: SortId; onChange: (sort: SortId) => void }) {
  const name = SORTS.find((s) => s.id === value)?.name ?? "Priority";
  return (
    <MenuRoot>
      <MenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-canvas px-2.5 text-sm text-ink-2 hover:bg-hover">
        <ArrowUpDown size={14} aria-hidden />
        Sort: {name}
      </MenuTrigger>
      <MenuPopup align="end">
        <BaseMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as SortId)}>
          {SORTS.map((s) => (
            <BaseMenu.RadioItem
              key={s.id}
              value={s.id}
              closeOnClick
              className="flex min-h-[34px] w-full items-center rounded-sm px-2.5 text-left text-sm text-ink outline-none select-none data-[checked]:font-semibold data-[checked]:text-accent-hover data-[highlighted]:bg-menu-hover"
            >
              {s.name}
            </BaseMenu.RadioItem>
          ))}
        </BaseMenu.RadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}
