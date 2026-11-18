import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { STATUSES, STATUS_ORDER } from "@/lib/design";
import { useCreateTask, useMoveTask } from "@/lib/mutations";
import { todayString } from "@/lib/task-filters";
import type { ProjectDetail, Task, TaskStatus } from "@/lib/types";
import { StatusDot } from "./task-badges";
import { TaskCard, TaskCardPreview, type SubtaskProgress } from "./task-card";

const NO_PROGRESS: SubtaskProgress = { done: 0, total: 0 };

export function TaskBoard({
  workspaceId,
  project,
  allTasks,
  visible,
  filtering,
  selectedId,
  onOpen,
}: {
  workspaceId: string;
  project: ProjectDetail;
  /** Every task in the project, used for counts, WIP and subtask progress. */
  allTasks: Task[];
  /** Filtered and sorted top-level tasks to show. */
  visible: Task[];
  filtering: boolean;
  selectedId?: string;
  onOpen: (taskId: string) => void;
}) {
  const move = useMoveTask(workspaceId, project.id);
  const editable = !project.archivedAt;
  const [dragging, setDragging] = useState<Task | null>(null);
  const [addingIn, setAddingIn] = useState<TaskStatus | null>(null);
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const today = todayString();

  // A small movement threshold keeps plain clicks as clicks; touch waits for
  // a short press so the board can still scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const columns = STATUS_ORDER.filter((s) => s !== "CANCELLED" || project.showCancelled);

  const { progress, totals } = useMemo(() => {
    const progress = new Map<string, SubtaskProgress>();
    const totals = new Map<TaskStatus, number>();
    for (const t of allTasks) {
      if (t.parentTaskId) {
        const p = progress.get(t.parentTaskId) ?? { done: 0, total: 0 };
        progress.set(t.parentTaskId, {
          done: p.done + (t.status === "DONE" ? 1 : 0),
          total: p.total + 1,
        });
      } else totals.set(t.status, (totals.get(t.status) ?? 0) + 1);
    }
    return { progress, totals };
  }, [allTasks]);

  const moveTo = (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    if (status === "CANCELLED") setCancelledOpen(true);
    move.mutate(
      { id: task.id, status },
      { onError: (error) => toastError(error, `Couldn’t move ${task.key}`) },
    );
  };

  const onDragStart = ({ active }: DragStartEvent) =>
    setDragging(visible.find((t) => t.id === active.id) ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const task = visible.find((t) => t.id === active.id);
    if (task && over) moveTo(task, over.id as TaskStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex min-h-[560px] flex-1 gap-3.5 overflow-x-auto bg-row-hover px-7 pt-[18px] pb-7">
        {columns.map((status) => {
          const cards = visible.filter((t) => t.status === status);
          const props = {
            status,
            cards,
            total: totals.get(status) ?? 0,
            wipLimit: status === "IN_PROGRESS" ? project.wipLimit : 0,
            filtering,
            editable,
          };
          if (status === "CANCELLED" && !cancelledOpen)
            return (
              <CollapsedColumn
                key={status}
                {...props}
                onExpand={() => setCancelledOpen(true)}
              />
            );
          return (
            <Column
              key={status}
              {...props}
              collapsible={status === "CANCELLED"}
              onCollapse={() => setCancelledOpen(false)}
              adding={addingIn === status}
              onStartAdd={() => setAddingIn(status)}
              onStopAdd={() => setAddingIn(null)}
              workspaceId={workspaceId}
              project={project}
            >
              {cards.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  fields={project.cardFields}
                  progress={progress.get(task.id) ?? NO_PROGRESS}
                  today={today}
                  selected={task.id === selectedId}
                  draggable={editable}
                  onOpen={() => onOpen(task.id)}
                  onMoveBy={(step) => {
                    const next = columns[columns.indexOf(task.status) + step];
                    if (next) moveTo(task, next);
                  }}
                />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <TaskCardPreview
            task={dragging}
            fields={project.cardFields}
            progress={progress.get(dragging.id) ?? NO_PROGRESS}
            today={today}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnBase {
  status: TaskStatus;
  cards: Task[];
  total: number;
  wipLimit: number;
  filtering: boolean;
  editable: boolean;
}

/** "3", "2 of 3" while filtering, or "4 / 3" against a WIP limit. */
const countText = ({ cards, total, wipLimit }: ColumnBase) =>
  wipLimit > 0
    ? `${total} / ${wipLimit}`
    : total === cards.length
      ? String(total)
      : `${cards.length} of ${total}`;

const emptyTitle = (status: TaskStatus, filtering: boolean) =>
  filtering
    ? "No matching tasks"
    : status === "DONE"
      ? "Nothing done yet"
      : status === "IN_PROGRESS"
        ? "No tasks in progress"
        : "No tasks here";

function Column({
  children,
  collapsible,
  onCollapse,
  adding,
  onStartAdd,
  onStopAdd,
  workspaceId,
  project,
  ...base
}: ColumnBase & {
  children: ReactNode;
  collapsible: boolean;
  onCollapse: () => void;
  adding: boolean;
  onStartAdd: () => void;
  onStopAdd: () => void;
  workspaceId: string;
  project: ProjectDetail;
}) {
  const { status, cards, total, wipLimit, filtering, editable } = base;
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !editable });
  const name = STATUSES[status].name;
  const overWip = wipLimit > 0 && total > wipLimit;

  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cn(
        "-m-1 flex min-w-[230px] flex-1 basis-0 flex-col gap-2.5 rounded-xl p-1",
        isOver && "bg-accent-soft outline-2 outline-accent outline-dashed",
      )}
    >
      <div className="flex h-8 items-center gap-2">
        <StatusDot status={status} />
        <h2 className="m-0 text-sm font-semibold">{name}</h2>
        <span className={cn("text-xs", overWip ? "font-semibold text-danger" : "text-muted")}>
          {countText(base)}
        </span>
        <span className="flex-1" />
        {collapsible ? (
          <button
            type="button"
            aria-label={`Collapse ${name} column`}
            onClick={onCollapse}
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-hover"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
        ) : null}
        {editable ? (
          <button
            type="button"
            aria-label={`Add task to ${name}`}
            onClick={onStartAdd}
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-hover"
          >
            <Plus size={15} aria-hidden />
          </button>
        ) : null}
      </div>

      {overWip ? (
        <span
          role="status"
          className="rounded-md border border-danger-line bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
        >
          Over the WIP limit of {wipLimit}. Finish something before starting more.
        </span>
      ) : null}

      {children}

      {cards.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border-[1.5px] border-dashed border-line-strong px-4 py-5 text-center">
          <span className="text-sm font-medium text-ink-2">{emptyTitle(status, filtering)}</span>
          {editable ? (
            <span className="text-xs text-muted">Drag a card here or add one.</span>
          ) : null}
        </div>
      ) : null}

      {editable ? (
        adding ? (
          <InlineAdd
            status={status}
            workspaceId={workspaceId}
            project={project}
            onDone={onStopAdd}
          />
        ) : (
          <button
            type="button"
            onClick={onStartAdd}
            className="flex h-9 items-center gap-1.5 rounded-md px-2 text-left text-sm text-muted hover:bg-hover"
          >
            <Plus size={14} aria-hidden />
            Add task
          </button>
        )
      ) : null}
    </section>
  );
}

function CollapsedColumn({
  status,
  total,
  editable,
  onExpand,
}: ColumnBase & { onExpand: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !editable });
  const name = STATUSES[status].name;
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cn(
        "flex w-11 shrink-0 flex-col items-center gap-2.5 rounded-lg pt-1",
        isOver ? "bg-accent-soft outline-2 outline-accent outline-dashed" : "bg-menu-hover",
      )}
    >
      <button
        type="button"
        aria-label={`Expand ${name} column`}
        onClick={onExpand}
        className="flex size-9 items-center justify-center rounded-sm text-muted hover:bg-hover"
      >
        <ChevronRight size={15} aria-hidden />
      </button>
      <span className="text-xs font-semibold text-muted [writing-mode:vertical-rl]">
        {name} · {total}
      </span>
    </section>
  );
}

/** Quick add at the bottom of a column; stays open for the next title. */
function InlineAdd({
  status,
  workspaceId,
  project,
  onDone,
}: {
  status: TaskStatus;
  workspaceId: string;
  project: ProjectDetail;
  onDone: () => void;
}) {
  const create = useCreateTask(workspaceId, project.id);
  const [title, setTitle] = useState("");
  const name = STATUSES[status].name;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    create.mutate(
      { title: trimmed, status, priority: project.defaultPriority, assigneeId: null },
      {
        onError: (error) => {
          // Give the text back so nothing typed is lost.
          setTitle(trimmed);
          toastError(error);
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-accent bg-canvas p-2.5"
    >
      <label className="flex flex-col gap-1">
        <span className="sr-only">New task title in {name}</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone();
          }}
          placeholder="Task title, then Enter"
          className="border-0 px-0.5 py-1 text-base text-ink outline-none"
        />
      </label>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="h-[30px] rounded-sm px-2.5 text-xs text-ink-2 hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-[30px] rounded-sm bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-strong"
        >
          Add
        </button>
      </div>
    </form>
  );
}
