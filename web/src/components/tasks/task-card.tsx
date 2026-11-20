import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ban, Calendar, CircleCheck, Ellipsis, MessageSquare } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { MenuItem, MenuLabel, MenuPopup, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { STATUSES } from "@/lib/design";
import { formatDue, isDueSoon, isOverdue } from "@/lib/task-filters";
import type { CardFields, Task, TaskStatus } from "@/lib/types";
import { LabelChip, PriorityChip, StatusDot } from "./task-badges";

export interface SubtaskProgress {
  done: number;
  total: number;
}

/** Quick actions offered by a card's ⋯ menu. */
export interface CardActions {
  /** Columns the card can move to (the board's visible statuses). */
  statuses: TaskStatus[];
  onMove: (status: TaskStatus) => void;
  /** Present when assigning to yourself makes sense. */
  onAssignToMe?: () => void;
  onUnassign?: () => void;
  onDelete: () => void;
}

/** A ring that fills with subtask progress; a check once all are done. */
function SubtaskRing({ done, total }: SubtaskProgress) {
  if (done === total)
    return <CircleCheck size={13} aria-hidden className="text-success" />;
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden className="-rotate-90">
      <circle cx="6.5" cy="6.5" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="2" />
      <circle
        cx="6.5"
        cy="6.5"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={`${(done / total) * c} ${c}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Card body, shared by the board and the drag preview. */
export function TaskCardBody({
  task,
  fields,
  progress,
  today,
  onOpen,
  menu,
}: {
  task: Task;
  fields: CardFields;
  progress: SubtaskProgress;
  today: string;
  onOpen?: () => void;
  menu?: ReactNode;
}) {
  const done = task.status === "DONE";
  const cancelled = task.status === "CANCELLED";
  const showSubtasks = fields.subtasks && progress.total > 0;
  const overdue = isOverdue(task, today);
  const soon = !overdue && isDueSoon(task, today);
  const dueWord = overdue ? "Overdue" : soon ? (task.dueDate!.slice(0, 10) === today ? "Today" : "Tomorrow") : null;
  const labels = fields.labels ? task.labels : [];

  return (
    <>
      <div className="flex h-5 items-center gap-2">
        <span className="text-xs font-medium text-muted">{task.key}</span>
        <span className="flex-1" />
        {menu}
      </div>

      <div className="flex items-start gap-1.5">
        {done ? <CircleCheck size={16} aria-label="Done" className="mt-[3px] shrink-0 text-success" /> : null}
        {cancelled ? <Ban size={15} aria-label="Cancelled" className="mt-[3px] shrink-0 text-muted" /> : null}
        <button
          type="button"
          onClick={(e) => {
            // The card itself also opens on click; open once.
            e.stopPropagation();
            onOpen?.();
          }}
          className={cn(
            "line-clamp-2 flex-1 border-0 bg-transparent p-0 text-left text-base leading-[1.4] font-medium text-ink",
            (done || cancelled) && "text-ink-2",
          )}
        >
          {task.title}
        </button>
      </div>

      {labels.length ? (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      ) : null}

      <div className="flex items-start gap-2 pt-0.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <PriorityChip priority={task.priority} />
        {fields.due && task.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs whitespace-nowrap",
              overdue ? "font-semibold text-danger" : soon ? "font-medium text-warn-ink" : "text-ink-2",
            )}
          >
            <Calendar size={13} aria-hidden />
            {formatDue(task.dueDate)}
            {dueWord ? <span>· {dueWord}</span> : null}
          </span>
        ) : null}
        {showSubtasks ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            <SubtaskRing {...progress} />
            {progress.done}/{progress.total}
            <span className="sr-only"> subtasks done</span>
          </span>
        ) : null}
        {fields.comments && task._count.comments > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            <MessageSquare size={13} aria-hidden />
            {task._count.comments}
            <span className="sr-only"> comments</span>
          </span>
        ) : null}
        </div>
        {fields.assignee ? (
          task.assignee ? (
            <Avatar user={task.assignee} size="xs" tooltip />
          ) : (
            <Tooltip content="Unassigned">
              <span
                role="img"
                aria-label="Unassigned"
                className="box-border size-[22px] rounded-full border-[1.5px] border-dashed border-faint"
              />
            </Tooltip>
          )
        ) : null}
      </div>
    </>
  );
}

/** The ⋯ menu: move, assign, delete without opening the task. */
function CardMenu({ task, actions }: { task: Task; actions: CardActions }) {
  return (
    // Menu events (the popup renders in a portal but still bubbles through
    // React) must not reach the card, which would open or drag it.
    <span
      className="contents"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <MenuRoot>
        <MenuTrigger
          aria-label={`Actions for ${task.key}`}
          className={cn(
            "-mr-1 flex size-6 items-center justify-center rounded-sm text-muted outline-none hover:bg-hover hover:text-ink",
            "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent data-[popup-open]:bg-hover data-[popup-open]:opacity-100",
            "[@media(hover:none)]:opacity-100",
          )}
        >
          <Ellipsis size={15} aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuLabel>Move to</MenuLabel>
          {actions.statuses
            .filter((s) => s !== task.status)
            .map((s) => (
              <MenuItem key={s} onClick={() => actions.onMove(s)}>
                <StatusDot status={s} />
                {STATUSES[s].name}
              </MenuItem>
            ))}
          {actions.onAssignToMe || actions.onUnassign ? <MenuSeparator /> : null}
          {actions.onAssignToMe ? <MenuItem onClick={actions.onAssignToMe}>Assign to me</MenuItem> : null}
          {actions.onUnassign ? <MenuItem onClick={actions.onUnassign}>Unassign</MenuItem> : null}
          <MenuSeparator />
          <MenuItem tone="danger" onClick={actions.onDelete}>
            Delete task
          </MenuItem>
        </MenuPopup>
      </MenuRoot>
    </span>
  );
}

const cardClass =
  "group/card flex flex-col gap-2.5 rounded-xl border border-line-soft bg-card p-3 text-left shadow-card transition-shadow";

export function TaskCard({
  task,
  fields,
  progress,
  today,
  selected,
  draggable,
  sortable = true,
  onOpen,
  onMoveBy,
  actions,
}: {
  task: Task;
  fields: CardFields;
  progress: SubtaskProgress;
  today: string;
  selected: boolean;
  draggable: boolean;
  /** Other cards make room for this one while dragging (manual order only). */
  sortable?: boolean;
  onOpen: () => void;
  /** Keyboard alternative to dragging: move one column left or right. */
  onMoveBy: (step: -1 | 1) => void;
  /** Quick actions; omitted when the project is read-only. */
  actions?: CardActions;
}) {
  const { setNodeRef, listeners, isDragging, transform, transition } = useSortable({
    id: task.id,
    disabled: { draggable: !draggable, droppable: !sortable },
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (!draggable || !event.altKey) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      onMoveBy(event.key === "ArrowRight" ? 1 : -1);
    }
  };

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={task.title}
      aria-keyshortcuts={draggable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
      className={cn(
        cardClass,
        draggable ? "cursor-grab touch-manipulation" : "cursor-pointer",
        selected ? "border-accent ring-2 ring-accent/25" : "hover:shadow-card-hover",
        isDragging && "opacity-40",
      )}
    >
      <TaskCardBody
        task={task}
        fields={fields}
        progress={progress}
        today={today}
        onOpen={onOpen}
        menu={actions ? <CardMenu task={task} actions={actions} /> : null}
      />
    </article>
  );
}

/** The card that follows the pointer while dragging. */
export function TaskCardPreview(props: {
  task: Task;
  fields: CardFields;
  progress: SubtaskProgress;
  today: string;
}) {
  return (
    <article
      className={cn(
        cardClass,
        // DragOverlay sizes the preview to the card being dragged.
        "pointer-events-none h-full rotate-[1.5deg] cursor-grabbing border-accent shadow-card-hover",
      )}
    >
      <TaskCardBody {...props} />
    </article>
  );
}
