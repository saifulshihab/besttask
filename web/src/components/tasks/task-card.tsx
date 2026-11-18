import { useDraggable } from "@dnd-kit/core";
import { Calendar, CircleCheck, MessageSquare } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatDue, isOverdue } from "@/lib/task-filters";
import type { CardFields, Task } from "@/lib/types";
import { LabelChip, PriorityChip } from "./task-badges";

export interface SubtaskProgress {
  done: number;
  total: number;
}

/** Card body, shared by the board and the drag preview. */
export function TaskCardBody({
  task,
  fields,
  progress,
  today,
  onOpen,
}: {
  task: Task;
  fields: CardFields;
  progress: SubtaskProgress;
  today: string;
  onOpen?: () => void;
}) {
  const closed = task.status === "DONE" || task.status === "CANCELLED";
  const showSubtasks = fields.subtasks && progress.total > 0;
  const overdue = isOverdue(task, today);
  return (
    <>
      <div className="flex items-start gap-2">
        <span className="pt-px text-xs font-medium text-muted">{task.key}</span>
        <button
          type="button"
          onClick={(e) => {
            // The card itself also opens on click; open once.
            e.stopPropagation();
            onOpen?.();
          }}
          className={cn(
            "flex-1 border-0 bg-transparent p-0 text-left text-base leading-[1.4] font-medium text-ink",
            closed && "text-muted line-through",
          )}
        >
          {task.title}
        </button>
      </div>
      {showSubtasks ? (
        <div aria-hidden className="h-1 overflow-hidden rounded-[2px] bg-line-soft">
          <div
            className="h-1 bg-[#B45309]"
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <PriorityChip priority={task.priority} />
        {fields.labels ? task.labels.map((l) => <LabelChip key={l.id} label={l} />) : null}
        {fields.due && task.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              overdue ? "font-semibold text-danger" : "text-ink-2",
            )}
          >
            <Calendar size={13} aria-hidden />
            {formatDue(task.dueDate)}
            {overdue ? <span className="sr-only"> (overdue)</span> : null}
          </span>
        ) : null}
        {showSubtasks ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            <CircleCheck size={13} aria-hidden />
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
        <span className="flex-1" />
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

const cardClass =
  "flex flex-col gap-2.5 rounded-lg border bg-canvas p-3 text-left shadow-[0_1px_2px_rgba(28,25,23,0.04)]";

export function TaskCard({
  task,
  fields,
  progress,
  today,
  selected,
  draggable,
  onOpen,
  onMoveBy,
}: {
  task: Task;
  fields: CardFields;
  progress: SubtaskProgress;
  today: string;
  selected: boolean;
  draggable: boolean;
  onOpen: () => void;
  /** Keyboard alternative to dragging: move one column left or right. */
  onMoveBy: (step: -1 | 1) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable,
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
      aria-label={task.title}
      aria-keyshortcuts={draggable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
      className={cn(
        cardClass,
        draggable ? "cursor-grab touch-manipulation" : "cursor-pointer",
        selected
          ? "border-accent shadow-[0_4px_14px_rgba(67,56,202,0.14)]"
          : "border-line hover:border-faint",
        isDragging && "opacity-40",
      )}
    >
      <TaskCardBody task={task} fields={fields} progress={progress} today={today} onOpen={onOpen} />
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
        "pointer-events-none h-full rotate-[1.5deg] cursor-grabbing border-accent shadow-[0_12px_32px_rgba(28,25,23,0.18)]",
      )}
    >
      <TaskCardBody {...props} />
    </article>
  );
}
