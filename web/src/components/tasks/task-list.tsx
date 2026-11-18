import { useState, type FormEvent } from "react";
import { toastError } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { STATUSES } from "@/lib/design";
import { plural } from "@/lib/format";
import { useCreateTask, useMoveTask } from "@/lib/mutations";
import { formatDue, isOverdue, todayString } from "@/lib/task-filters";
import type { ProjectDetail, Task } from "@/lib/types";
import { LabelChip, PriorityChip, StatusDot } from "./task-badges";
import { Checkbox } from "@/components/ui/checkbox";

export const PAGE_SIZE = 10;
const grid = "grid grid-cols-[minmax(0,1fr)_150px_130px_100px_100px] gap-2";

/** Prototype list view: a paged table of top-level tasks, subtasks optional. */
export function TaskList({
  workspaceId,
  project,
  allTasks,
  visible,
  filtering,
  page,
  showSubtasks,
  onPage,
  onOpen,
}: {
  workspaceId: string;
  project: ProjectDetail;
  allTasks: Task[];
  visible: Task[];
  filtering: boolean;
  page: number;
  showSubtasks: boolean;
  onPage: (page: number) => void;
  onOpen: (taskId: string) => void;
}) {
  const move = useMoveTask(workspaceId, project.id);
  const editable = !project.archivedAt;
  const today = todayString();
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const subsOf = (id: string) => allTasks.filter((t) => t.parentTaskId === id);

  return (
    <div className="overflow-x-auto px-7 pt-2 pb-7">
      <div className="min-w-[760px] text-sm">
        <div className={cn(grid, "border-b border-line px-2 py-2.5 text-xs font-medium text-muted")}>
          <span>Title</span>
          <span>Status</span>
          <span>Priority</span>
          <span>Assignee</span>
          <span>Due</span>
        </div>
        {rows.map((task) => {
          const subs = subsOf(task.id);
          const done = subs.filter((s) => s.status === "DONE").length;
          const closed = task.status === "DONE" || task.status === "CANCELLED";
          return (
            <div key={task.id}>
              <div className={cn(grid, "items-center border-b border-line-soft px-2 py-1.5 hover:bg-row-hover")}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-xs text-muted">{task.key}</span>
                  <button
                    type="button"
                    onClick={() => onOpen(task.id)}
                    className={cn(
                      "truncate border-0 bg-transparent py-1.5 text-left text-sm font-medium text-ink",
                      closed && "text-muted line-through",
                    )}
                  >
                    {task.title}
                  </button>
                  {task.labels.map((l) => (
                    <span key={l.id} className="shrink-0">
                      <LabelChip label={l} />
                    </span>
                  ))}
                  {subs.length ? (
                    <span className="shrink-0 text-xs text-muted">
                      {done}/{plural(subs.length, "subtask")}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <StatusDot status={task.status} />
                  {STATUSES[task.status].name}
                </span>
                <span className="flex items-center">
                  <PriorityChip priority={task.priority} />
                </span>
                <span className="flex min-h-[30px] items-center">
                  {task.assignee ? (
                    <Avatar user={task.assignee} size="sm" tooltip />
                  ) : (
                    <Tooltip content="Unassigned">
                      <span
                        role="img"
                aria-label="Unassigned"
                        className="box-border size-6 rounded-full border border-dashed border-faint"
                      />
                    </Tooltip>
                  )}
                </span>
                <span
                  className={cn(
                    "flex items-center text-sm",
                    isOverdue(task, today) ? "font-semibold text-danger" : "text-ink-2",
                  )}
                >
                  {task.dueDate ? formatDue(task.dueDate) : "—"}
                </span>
              </div>
              {showSubtasks
                ? subs.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2.5 border-b border-menu-hover py-1 pr-2 pl-[52px] text-sm text-ink-2"
                    >
                      <label className="flex min-h-[30px] cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={sub.status === "DONE"}
                          disabled={!editable}
                          onChange={() =>
                            move.mutate({ id: sub.id, status: sub.status === "DONE" ? "TODO" : "DONE" })
                          }
                        />
                        <span className={cn(sub.status === "DONE" && "text-muted line-through")}>{sub.title}</span>
                      </label>
                    </div>
                  ))
                : null}
            </div>
          );
        })}

        {rows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted">
            {filtering ? "No tasks match your search or filters." : "No tasks in this project yet."}
          </div>
        ) : null}

        {editable ? <ListAdd workspaceId={workspaceId} project={project} /> : null}

        {visible.length > PAGE_SIZE ? (
          <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5 px-2 pt-3.5">
            <span className="min-w-[180px] flex-1 text-xs text-muted">
              Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(visible.length, current * PAGE_SIZE)} of{" "}
              {visible.length} tasks
            </span>
            <button
              type="button"
              disabled={current === 1}
              onClick={() => onPage(current - 1)}
              className="h-8 rounded-sm border border-line-strong bg-canvas px-3 text-sm text-ink"
            >
              Previous
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === current ? "page" : undefined}
                onClick={() => onPage(n)}
                className={cn(
                  "h-8 min-w-8 rounded-sm border px-2 text-sm",
                  n === current
                    ? "border-accent-line bg-accent-tint font-semibold text-accent-hover"
                    : "border-transparent bg-transparent text-ink-2 hover:bg-hover",
                )}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={current === pages}
              onClick={() => onPage(current + 1)}
              className="h-8 rounded-sm border border-line-strong bg-canvas px-3 text-sm text-ink"
            >
              Next
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

/** "+ Add task" below the table; new tasks start in Backlog, as in the prototype. */
function ListAdd({ workspaceId, project }: { workspaceId: string; project: ProjectDetail }) {
  const create = useCreateTask(workspaceId, project.id);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    create.mutate(
      { title: trimmed, status: "BACKLOG", priority: project.defaultPriority, assigneeId: null },
      { onError: (error) => (setTitle(trimmed), toastError(error)) },
    );
  };
  if (!adding)
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="my-1 h-9 rounded-sm px-2 text-sm text-muted hover:bg-hover"
      >
        + Add task
      </button>
    );
  return (
    <form onSubmit={submit} className="flex items-center gap-2 p-2">
      <label className="flex flex-1">
        <span className="sr-only">New task title</span>
        <input
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          placeholder="Task title, then Enter"
          className="h-8 flex-1 rounded-sm border border-line-strong bg-canvas px-2.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={!title.trim()}
        className="h-8 rounded-sm bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-strong"
      >
        Add
      </button>
      <button type="button" onClick={() => setAdding(false)} className="h-8 rounded-sm px-2.5 text-xs text-ink-2 hover:bg-hover">
        Cancel
      </button>
    </form>
  );
}
