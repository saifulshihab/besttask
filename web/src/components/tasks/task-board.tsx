import {
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react";
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { toastError } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { STATUSES, STATUS_ORDER } from "@/lib/design";
import { useCreateTask, useMoveTask, useReorderTask } from "@/lib/mutations";
import { meQuery } from "@/lib/queries";
import { todayString } from "@/lib/task-filters";
import { useDeleteTask, useUpdateTask } from "@/lib/task-mutations";
import type { ProjectDetail, Task, TaskStatus } from "@/lib/types";
import { StatusDot } from "./task-badges";
import { TaskCard, TaskCardPreview, type CardActions, type SubtaskProgress } from "./task-card";

const NO_PROGRESS: SubtaskProgress = { done: 0, total: 0 };

export function TaskBoard({
  workspaceId,
  project,
  allTasks,
  visible,
  filtering,
  manual,
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
  /** The board is in manual order: dragging also reorders within a column. */
  manual: boolean;
  selectedId?: string;
  onOpen: (taskId: string) => void;
}) {
  const move = useMoveTask(workspaceId, project.id);
  const reorder = useReorderTask(workspaceId, project.id);
  const update = useUpdateTask(workspaceId, project.id);
  const remove = useDeleteTask(workspaceId, project.id);
  const { data: me } = useSuspenseQuery(meQuery);
  const editable = !project.archivedAt;
  // While dragging, a working copy of the board (task ids per column) lets
  // cards make room as the dragged card crosses columns.
  /** `over` is the column under the pointer, whether over the lane or a card in it. */
  const [drag, setDrag] = useState<{ task: Task; layout: Layout; over?: TaskStatus } | null>(null);
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

  const byId = useMemo(() => new Map(visible.map((t) => [t.id, t])), [visible]);
  const baseLayout = useMemo(
    () => Object.fromEntries(columns.map((s) => [s, visible.filter((t) => t.status === s).map((t) => t.id)])) as Layout,
    [visible, columns],
  );
  const layout = drag?.layout ?? baseLayout;
  /** The column an id belongs to: a column id itself, or the column holding that card. */
  const columnOf = (id: string, of: Layout = layout) =>
    (columns as string[]).includes(id) ? (id as TaskStatus) : columns.find((s) => of[s]?.includes(id));

  const moveTo = (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    if (status === "CANCELLED") setCancelledOpen(true);
    move.mutate(
      { id: task.id, status },
      { onError: (error) => toastError(error, `Couldn’t move ${task.key}`) },
    );
  };

  /** The card menu: move, assign to yourself or unassign, delete (with Undo). */
  const actionsFor = (task: Task): CardActions => ({
    statuses: columns,
    onMove: (status) => moveTo(task, status),
    onAssignToMe:
      task.assigneeId !== me.id
        ? () => update.mutate({ id: task.id, patch: { assigneeId: me.id } })
        : undefined,
    onUnassign: task.assigneeId
      ? () => update.mutate({ id: task.id, patch: { assigneeId: null } })
      : undefined,
    onDelete: () => remove.mutate(task),
  });

  // The column under the pointer wins; the closest card inside it then sets
  // the position. Plain closestCorners measures to a lane's far corners, so
  // near the top of a tall empty column a card next door could win instead.
  const collisionDetection: CollisionDetection = (args) => {
    const column = pointerWithin(args).find((c) => (columns as string[]).includes(String(c.id)));
    if (!column) return closestCorners(args);
    const ids = layout[column.id as TaskStatus] ?? [];
    const cards = closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => ids.includes(String(c.id))),
    });
    return cards.length ? cards : [column];
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const task = byId.get(String(active.id));
    if (task) setDrag({ task, layout: baseLayout });
  };

  // Crossing into another column: move the card into it, where it is hovered.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!drag) return;
    const id = String(active.id);
    const from = columnOf(id, drag.layout);
    const to = over ? columnOf(String(over.id), drag.layout) : undefined;
    if (!from || !to || from === to) {
      if (to !== drag.over) setDrag({ ...drag, over: to });
      return;
    }
    const target = drag.layout[to];
    const at = target.indexOf(String(over!.id));
    const next = { ...drag.layout, [from]: drag.layout[from].filter((x) => x !== id), [to]: [...target] };
    next[to].splice(at === -1 ? target.length : at, 0, id);
    setDrag({ ...drag, layout: next, over: to });
  };

  const onDragEnd = ({ over }: DragEndEvent) => {
    const current = drag;
    setDrag(null);
    if (!current || !over) return;
    const { task } = current;
    const to = columnOf(String(over.id), current.layout);
    if (!to) return;
    let ids = current.layout[to];
    const overId = String(over.id);
    if (ids.includes(overId) && overId !== task.id)
      ids = arrayMove(ids, ids.indexOf(task.id), ids.indexOf(overId));
    if (!manual) {
      // Another sort decides the order: dropping only changes the column.
      moveTo(task, to);
      return;
    }
    const beforeId = ids[ids.indexOf(task.id) + 1] ?? null;
    const original = baseLayout[task.status];
    const unchanged = to === task.status && (original[original.indexOf(task.id) + 1] ?? null) === beforeId;
    if (unchanged) return;
    if (to === "CANCELLED") setCancelledOpen(true);
    reorder.mutate(
      { id: task.id, status: to, beforeId },
      { onError: (error) => toastError(error, `Couldn’t move ${task.key}`) },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="flex min-h-[560px] flex-1 gap-2.5 overflow-x-auto bg-canvas px-6 pt-[18px] pb-7">
        {columns.map((status) => {
          const cards = (layout[status] ?? []).map((id) => byId.get(id)).filter((t): t is Task => !!t);
          const props = {
            status,
            cards,
            total: totals.get(status) ?? 0,
            wipLimit: status === "IN_PROGRESS" ? project.wipLimit : 0,
            filtering,
            editable,
            over: drag?.over === status,
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
              <SortableContext items={layout[status] ?? []} strategy={verticalListSortingStrategy}>
              {cards.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  fields={project.cardFields}
                  progress={progress.get(task.id) ?? NO_PROGRESS}
                  today={today}
                  selected={task.id === selectedId}
                  draggable={editable}
                  sortable={manual}
                  onOpen={() => onOpen(task.id)}
                  onMoveBy={(step) => {
                    const next = columns[columns.indexOf(task.status) + step];
                    if (next) moveTo(task, next);
                  }}
                  actions={editable ? actionsFor(task) : undefined}
                />
              ))}
              </SortableContext>
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {drag ? (
          <TaskCardPreview
            task={drag.task}
            fields={project.cardFields}
            progress={progress.get(drag.task.id) ?? NO_PROGRESS}
            today={today}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Task ids per column, in display order. */
type Layout = Record<TaskStatus, string[]>;

interface ColumnBase {
  status: TaskStatus;
  cards: Task[];
  total: number;
  wipLimit: number;
  filtering: boolean;
  editable: boolean;
  /** A dragged card is over this column (its lane or one of its cards). */
  over: boolean;
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

/**
 * Lanes share one neutral background; while a card is dragged over one, it
 * takes a faint tint of its status and a dashed outline shows where it lands.
 */
const laneStyle = (status: TaskStatus, over: boolean): CSSProperties | undefined => {
  if (!over) return undefined;
  const hue = STATUSES[status].hue;
  return {
    background: `color-mix(in srgb, ${hue} 9%, var(--color-lane))`,
    outline: `2px dashed color-mix(in srgb, ${hue} 55%, transparent)`,
    outlineOffset: "-2px",
  };
};

/** The column title: the status dot and name. */
function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap pl-1.5 text-ink">
      <StatusDot status={status} />
      <h2 className="m-0 text-sm font-semibold">{STATUSES[status].name}</h2>
    </span>
  );
}

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
  const { status, cards, total, wipLimit, filtering, editable, over } = base;
  const { setNodeRef } = useDroppable({ id: status, disabled: !editable });
  const navigate = useNavigate();
  const name = STATUSES[status].name;
  const overWip = wipLimit > 0 && total > wipLimit;
  const canManage = project.role !== "MEMBER";
  const iconButton =
    "flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink data-[popup-open]:bg-hover";

  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      style={laneStyle(status, over)}
      className="flex min-w-[208px] flex-1 basis-0 flex-col gap-2 rounded-2xl bg-lane p-2 transition-colors"
    >
      <div className="flex h-9 items-center gap-1.5 pr-0.5 pl-1">
        <StatusPill status={status} />
        <span
          className={cn("shrink-0 text-xs whitespace-nowrap tabular-nums", overWip ? "font-semibold text-danger" : "font-medium text-muted")}
          title={wipLimit > 0 ? `Work-in-progress limit: ${wipLimit}` : undefined}
        >
          {countText(base)}
        </span>
        <span className="flex-1" />
        {collapsible ? (
          <button type="button" aria-label={`Collapse ${name} column`} onClick={onCollapse} className={iconButton}>
            <ChevronLeft size={15} aria-hidden />
          </button>
        ) : null}
        {editable ? (
          <>
            <MenuRoot>
              <MenuTrigger aria-label={`${name} column options`} className={iconButton}>
                <Ellipsis size={15} aria-hidden />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={onStartAdd}>Add task</MenuItem>
                {canManage ? (
                  <MenuItem
                    onClick={() =>
                      void navigate({
                        to: "/w/$workspaceId/p/$projectId/settings",
                        params: { workspaceId, projectId: project.id },
                        hash: "board",
                      })
                    }
                  >
                    {status === "IN_PROGRESS" ? "Set work-in-progress limit" : "Board settings"}
                  </MenuItem>
                ) : null}
              </MenuPopup>
            </MenuRoot>
            <button type="button" aria-label={`Add task to ${name}`} onClick={onStartAdd} className={iconButton}>
              <Plus size={15} aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {overWip ? (
        <span
          role="status"
          className="rounded-lg border border-danger-line bg-danger-soft px-2.5 py-1.5 text-xs text-danger-ink"
        >
          Over the WIP limit of {wipLimit}. Finish something before starting more.
        </span>
      ) : null}

      {children}

      {cards.length === 0 && !adding ? (
        <p className="m-0 px-2 py-5 text-center text-sm text-muted">
          {emptyTitle(status, filtering)}
          {editable ? <span className="block text-xs text-faint">Drop a card here or add one.</span> : null}
        </p>
      ) : null}

      {editable ? (
        adding ? (
          <InlineAdd status={status} workspaceId={workspaceId} project={project} onDone={onStopAdd} />
        ) : (
          <button
            type="button"
            onClick={onStartAdd}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-left text-sm text-muted hover:bg-card hover:text-ink hover:shadow-card"
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
  over,
  onExpand,
}: ColumnBase & { onExpand: () => void }) {
  const { setNodeRef } = useDroppable({ id: status, disabled: !editable });
  const name = STATUSES[status].name;
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      style={laneStyle(status, over)}
      className="flex w-12 shrink-0 flex-col items-center gap-3 rounded-2xl bg-lane py-2 transition-colors"
    >
      <button
        type="button"
        aria-label={`Expand ${name} column`}
        onClick={onExpand}
        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
      >
        <ChevronRight size={15} aria-hidden />
      </button>
      <StatusDot status={status} />
      <span className="text-xs font-semibold text-ink-2 [writing-mode:vertical-rl]">
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
      className="flex flex-col gap-2 rounded-xl border border-accent bg-card p-2.5 shadow-card"
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
          className="border-0 bg-transparent px-0.5 py-1 text-base text-ink outline-none"
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
