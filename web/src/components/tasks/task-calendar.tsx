import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Popover } from "@base-ui/react/popover";
import { Ban, CalendarX2, ChevronLeft, ChevronRight, CircleCheck, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  currentMonth,
  dueDateFor,
  longDay,
  monthTitle,
  monthWeeks,
  shiftMonth,
  WEEKDAYS,
  type CalendarDay,
} from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { STATUSES } from "@/lib/design";
import { useCreateTask } from "@/lib/mutations";
import { isOverdue } from "@/lib/task-filters";
import { useUpdateTask } from "@/lib/task-mutations";
import { toastError } from "@/lib/toast";
import type { ProjectDetail, Task } from "@/lib/types";
import { useIsMobile } from "@/lib/use-mobile";
import { StatusDot } from "./task-badges";

/** Chips a day shows before collapsing the rest into "+N more". */
const MAX_PER_DAY = 3;
const UNSCHEDULED = "unscheduled";

const isOpen = (task: Task) => task.status !== "DONE" && task.status !== "CANCELLED";

interface CalendarProps {
  workspaceId: string;
  project: ProjectDetail;
  /** Filtered and sorted top-level tasks to show. */
  visible: Task[];
  /** YYYY-MM. */
  month: string;
  today: string;
  selectedId?: string;
  onMonth: (month: string) => void;
  onOpen: (taskId: string) => void;
}

/**
 * Month view of tasks by due date. Drag a task to another day to reschedule
 * it, onto "No due date" to clear its date, or from there onto a day to
 * schedule it. The + on a day adds a task due that day.
 */
export function TaskCalendar(props: CalendarProps) {
  const { visible, month } = props;
  const mobile = useIsMobile();

  const { byDay, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    const unscheduled: Task[] = [];
    for (const task of visible) {
      if (!task.dueDate) {
        // Finished work without a date has nothing left to schedule.
        if (isOpen(task)) unscheduled.push(task);
        continue;
      }
      const day = task.dueDate.slice(0, 10);
      const list = byDay.get(day);
      if (list) list.push(task);
      else byDay.set(day, [task]);
    }
    return { byDay, unscheduled };
  }, [visible]);

  const weeks = useMemo(() => monthWeeks(month), [month]);

  return mobile ? (
    <Agenda {...props} weeks={weeks} byDay={byDay} unscheduled={unscheduled} />
  ) : (
    <MonthGrid {...props} weeks={weeks} byDay={byDay} unscheduled={unscheduled} />
  );
}

interface LayoutProps extends CalendarProps {
  weeks: CalendarDay[][];
  byDay: Map<string, Task[]>;
  unscheduled: Task[];
}

function MonthHeader({
  month,
  onMonth,
  trailing,
}: {
  month: string;
  onMonth: (month: string) => void;
  trailing?: ReactNode;
}) {
  const nav = "inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-canvas text-ink-2 hover:bg-hover";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="m-0 min-w-[150px] text-lg font-semibold" aria-live="polite">
        {monthTitle(month)}
      </h2>
      <button type="button" aria-label="Previous month" className={nav} onClick={() => onMonth(shiftMonth(month, -1))}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <button type="button" aria-label="Next month" className={nav} onClick={() => onMonth(shiftMonth(month, 1))}>
        <ChevronRight size={16} aria-hidden />
      </button>
      <button
        type="button"
        disabled={month === currentMonth()}
        onClick={() => onMonth(currentMonth())}
        className="h-8 rounded-md border border-line-strong bg-canvas px-3 text-sm text-ink-2 hover:bg-hover disabled:opacity-50 disabled:hover:bg-canvas"
      >
        Today
      </button>
      <span className="flex-1" />
      {trailing}
    </div>
  );
}

function MonthGrid({
  workspaceId,
  project,
  month,
  today,
  selectedId,
  onMonth,
  onOpen,
  weeks,
  byDay,
  unscheduled,
}: LayoutProps) {
  const update = useUpdateTask(workspaceId, project.id);
  const editable = !project.archivedAt;
  const [dragging, setDragging] = useState<Task | null>(null);
  const [addingOn, setAddingOn] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);

  // Same thresholds as the board: a plain click still opens the task.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const onDragStart = ({ active }: DragStartEvent) =>
    setDragging((active.data.current as { task: Task } | undefined)?.task ?? null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = (active.data.current as { task: Task } | undefined)?.task;
    if (!task || !over) return;
    const target = String(over.id);
    const dueDate = target === UNSCHEDULED ? null : dueDateFor(target);
    if ((task.dueDate?.slice(0, 10) ?? null) === (dueDate?.slice(0, 10) ?? null)) return;
    update.mutate({ id: task.id, patch: { dueDate } });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto px-7 py-4">
          <MonthHeader
            month={month}
            onMonth={onMonth}
            trailing={
              <button
                type="button"
                aria-pressed={trayOpen}
                onClick={() => setTrayOpen((open) => !open)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-ink-2",
                  trayOpen ? "border-accent-line bg-accent-soft" : "border-line-strong bg-canvas hover:bg-hover",
                )}
              >
                <CalendarX2 size={14} aria-hidden />
                No due date
                <span className="text-xs font-medium text-muted">{unscheduled.length}</span>
              </button>
            }
          />
          <div className="min-w-[700px] overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-7 border-b border-line bg-lane" aria-hidden>
              {WEEKDAYS.map((name) => (
                <span key={name} className="px-2.5 py-2 text-xs font-semibold text-muted">
                  {name}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]!.day} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map((day) => (
                  <DayCell
                    key={day.day}
                    day={day}
                    today={today}
                    tasks={byDay.get(day.day) ?? []}
                    editable={editable}
                    selectedId={selectedId}
                    adding={addingOn === day.day}
                    onAdd={() => setAddingOn(day.day)}
                    onAddDone={() => setAddingOn(null)}
                    onOpen={onOpen}
                    workspaceId={workspaceId}
                    project={project}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        {trayOpen ? (
          <Unscheduled
            tasks={unscheduled}
            today={today}
            editable={editable}
            selectedId={selectedId}
            dragging={!!dragging?.dueDate}
            onOpen={onOpen}
          />
        ) : null}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? <ChipBody task={dragging} today={today} className="w-[180px] shadow-card-hover" /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayCell({
  day,
  today,
  tasks,
  editable,
  selectedId,
  adding,
  onAdd,
  onAddDone,
  onOpen,
  workspaceId,
  project,
}: {
  day: CalendarDay;
  today: string;
  tasks: Task[];
  editable: boolean;
  selectedId?: string;
  adding: boolean;
  onAdd: () => void;
  onAddDone: () => void;
  onOpen: (taskId: string) => void;
  workspaceId: string;
  project: ProjectDetail;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.day, disabled: !editable });
  const isToday = day.day === today;
  const shown = tasks.slice(0, MAX_PER_DAY);
  const hidden = tasks.length - shown.length;
  const label = `${longDay(day.day)}${isToday ? ", today" : ""}, ${tasks.length} task${tasks.length === 1 ? "" : "s"}`;

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "group relative flex min-h-[118px] min-w-0 flex-col gap-1 border-r border-line p-1.5 last:border-r-0",
        day.inMonth ? (day.weekend ? "bg-row-hover" : "bg-canvas") : "bg-lane",
        isOver && "bg-accent-tint ring-2 ring-accent-line ring-inset",
      )}
    >
      <div className="flex h-6 items-center justify-between px-0.5">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
            isToday ? "bg-accent font-semibold text-white" : day.inMonth ? "text-ink-2" : "text-faint",
          )}
          aria-hidden
        >
          {day.date}
        </span>
        {editable && !adding ? (
          <button
            type="button"
            aria-label={`Add task due ${longDay(day.day)}`}
            onClick={onAdd}
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100"
          >
            <Plus size={14} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
      </div>
      {shown.map((task) => (
        <Chip
          key={task.id}
          task={task}
          today={today}
          editable={editable}
          selected={task.id === selectedId}
          onOpen={() => onOpen(task.id)}
        />
      ))}
      {hidden > 0 ? <MoreTasks day={day.day} tasks={tasks} today={today} hidden={hidden} onOpen={onOpen} /> : null}
      {adding ? <DayAdd day={day.day} workspaceId={workspaceId} project={project} onDone={onAddDone} /> : null}
    </section>
  );
}

/** A task on the calendar: status, title and assignee in one line. */
function ChipBody({ task, today, className }: { task: Task; today: string; className?: string }) {
  const done = task.status === "DONE";
  const cancelled = task.status === "CANCELLED";
  const overdue = isOverdue(task, today);
  return (
    <span
      className={cn(
        "flex h-[26px] min-w-0 items-center gap-1.5 rounded-md border border-line bg-card px-1.5 text-xs shadow-card",
        overdue && "border-danger-line",
        className,
      )}
    >
      {done ? (
        <CircleCheck size={12} className="shrink-0 text-success" aria-hidden />
      ) : cancelled ? (
        <Ban size={12} className="shrink-0 text-muted" aria-hidden />
      ) : (
        <StatusDot status={task.status} />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left font-medium",
          done || cancelled ? "text-muted" : overdue ? "text-danger-ink" : "text-ink",
        )}
      >
        {task.title}
      </span>
      {task.assignee ? (
        <Avatar user={task.assignee} size="xs" className="size-4 text-[7px]" />
      ) : null}
    </span>
  );
}

const chipLabel = (task: Task, today: string) =>
  `${task.key} ${task.title}, ${STATUSES[task.status].name}${isOverdue(task, today) ? ", overdue" : ""}${
    task.assignee ? `, assigned to ${task.assignee.name || task.assignee.email}` : ""
  }`;

function Chip({
  task,
  today,
  editable,
  selected,
  onOpen,
}: {
  task: Task;
  today: string;
  editable: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !editable,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      // dnd-kit makes the button a draggable "button" role; keep it a button
      // that opens the task, and describe it fully for screen readers.
      role={undefined}
      aria-roledescription={undefined}
      aria-label={chipLabel(task, today)}
      title={`${task.key} · ${task.title}`}
      onClick={onOpen}
      className={cn(
        "block w-full min-w-0 touch-manipulation rounded-md border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent",
        isDragging && "opacity-40",
        editable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <ChipBody task={task} today={today} className={cn(selected && "border-accent ring-2 ring-accent/25")} />
    </button>
  );
}

function MoreTasks({
  day,
  tasks,
  today,
  hidden,
  onOpen,
}: {
  day: string;
  tasks: Task[];
  today: string;
  hidden: number;
  onOpen: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="h-6 rounded-sm px-1.5 text-left text-xs font-medium text-muted hover:bg-hover hover:text-ink">
        +{hidden} more
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-30">
          <Popover.Popup className="flex w-[260px] flex-col gap-1 rounded-lg border border-line bg-canvas p-2 shadow-popover outline-none">
            <Popover.Title className="m-0 px-1 pb-1 text-xs font-semibold text-ink-2">{longDay(day)}</Popover.Title>
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                aria-label={chipLabel(task, today)}
                onClick={() => {
                  setOpen(false);
                  onOpen(task.id);
                }}
                className="block w-full rounded-md border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChipBody task={task} today={today} />
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Quick add inside a day: the new task is due that day. */
function DayAdd({
  day,
  workspaceId,
  project,
  onDone,
}: {
  day: string;
  workspaceId: string;
  project: ProjectDetail;
  onDone: () => void;
}) {
  const create = useCreateTask(workspaceId, project.id);
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    create.mutate(
      {
        title: trimmed,
        status: project.defaultStatus,
        priority: project.defaultPriority,
        assigneeId: null,
        dueDate: dueDateFor(day),
      },
      {
        onError: (error) => {
          setTitle(trimmed);
          toastError(error);
        },
      },
    );
  };
  return (
    <form onSubmit={submit}>
      <label>
        <span className="sr-only">New task due {longDay(day)}</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone();
          }}
          onBlur={() => {
            if (!title.trim()) onDone();
          }}
          placeholder="Title, then Enter"
          className="h-[26px] w-full rounded-md border border-accent bg-card px-1.5 text-xs text-ink outline-none"
        />
      </label>
    </form>
  );
}

function Unscheduled({
  tasks,
  today,
  editable,
  selectedId,
  dragging,
  onOpen,
}: {
  tasks: Task[];
  today: string;
  editable: boolean;
  selectedId?: string;
  /** A scheduled task is being dragged, so this panel is a drop target. */
  dragging: boolean;
  onOpen: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNSCHEDULED, disabled: !editable });
  return (
    <aside
      ref={setNodeRef}
      aria-label="Tasks with no due date"
      className={cn(
        "w-[260px] shrink-0 border-l border-line bg-lane",
        dragging && "ring-2 ring-accent-line ring-inset",
        isOver && "bg-accent-tint",
      )}
    >
      {/* The page scrolls as a whole, so the list sticks in view and scrolls
          on its own instead of stretching the page with every open task. */}
      <div className="sticky top-0 flex max-h-svh flex-col gap-2 overflow-y-auto p-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 text-sm font-semibold">
            No due date <span className="text-xs font-medium text-muted">{tasks.length}</span>
          </h3>
          {editable ? (
            <p className="m-0 text-xs text-muted">
              {dragging ? "Drop here to clear the due date." : "Drag a task onto a day to schedule it."}
            </p>
          ) : null}
        </div>
        {tasks.map((task) => (
          <Chip
            key={task.id}
            task={task}
            today={today}
            editable={editable}
            selected={task.id === selectedId}
            onOpen={() => onOpen(task.id)}
          />
        ))}
        {tasks.length === 0 ? <p className="m-0 text-xs text-muted">Every open task has a due date.</p> : null}
      </div>
    </aside>
  );
}

/**
 * Phones: the month as a list of the days that have tasks, then the tasks
 * with no due date. Dates change in the task panel.
 */
function Agenda({ month, today, onMonth, onOpen, weeks, byDay, unscheduled }: LayoutProps) {
  const days = weeks.flat().filter((d) => d.inMonth && byDay.has(d.day));
  const row = (task: Task) => (
    <li key={task.id}>
      <button
        type="button"
        aria-label={chipLabel(task, today)}
        onClick={() => onOpen(task.id)}
        className="block w-full rounded-md border-0 bg-transparent p-0 text-left"
      >
        <ChipBody task={task} today={today} className="h-9 text-sm" />
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <MonthHeader month={month} onMonth={onMonth} />
      {days.length === 0 ? <p className="m-0 text-sm text-muted">No tasks due in {monthTitle(month)}.</p> : null}
      {days.map((d) => (
        <section key={d.day} aria-label={longDay(d.day)} className="flex flex-col gap-1.5">
          <h3 className={cn("m-0 text-xs font-semibold", d.day === today ? "text-accent-hover" : "text-ink-2")}>
            {longDay(d.day)}
            {d.day === today ? " · Today" : ""}
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{byDay.get(d.day)!.map(row)}</ul>
        </section>
      ))}
      {unscheduled.length ? (
        <section aria-label="Tasks with no due date" className="flex flex-col gap-1.5">
          <h3 className="m-0 text-xs font-semibold text-ink-2">No due date · {unscheduled.length}</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{unscheduled.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
