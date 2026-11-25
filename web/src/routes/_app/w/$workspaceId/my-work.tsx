import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Check, CircleCheck, Search } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { PriorityChip, StatusDot } from "@/components/tasks/task-badges";
import { TaskPanel } from "@/components/tasks/task-panel";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { PRIORITIES, STATUSES } from "@/lib/design";
import { dueLabel, groupTasks, isFinished, type GroupId } from "@/lib/my-work";
import { keys, myTasksQuery, projectQuery, projectsQuery, taskQuery, workspaceQuery } from "@/lib/queries";
import { todayString } from "@/lib/task-filters";
import { useUpdateTask } from "@/lib/task-mutations";
import type { ProjectListItem, Task } from "@/lib/types";

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  project: z.string().optional().catch(undefined),
  /** Also show done and cancelled tasks. */
  done: z.boolean().optional().catch(undefined),
  /** The task open in the detail panel. */
  task: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/w/$workspaceId/my-work")({
  validateSearch: searchSchema,
  loader: ({ context: { queryClient }, params: { workspaceId } }) =>
    Promise.all([
      queryClient.ensureQueryData(myTasksQuery(workspaceId)),
      queryClient.ensureQueryData(projectsQuery(workspaceId)),
    ]),
  component: MyWork,
});

function MyWork() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: tasks } = useSuspenseQuery(myTasksQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const today = todayString();

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // Archived projects are read-only and out of the way; so is their work.
  const live = useMemo(
    () => tasks.filter((t) => { const p = projectById.get(t.projectId); return p && !p.archivedAt; }),
    [tasks, projectById],
  );
  const open = live.filter((t) => !isFinished(t));
  // Only projects that hold some of the user's tasks are worth filtering by.
  const myProjects = projects.filter((p) => live.some((t) => t.projectId === p.id));
  const project = projectById.get(search.project ?? "");

  const groups = useMemo(() => {
    const q = search.q?.trim().toLowerCase();
    const shown = live.filter(
      (t) =>
        (search.done || !isFinished(t)) &&
        (!search.project || t.projectId === search.project) &&
        (!q || `${t.key} ${t.title}`.toLowerCase().includes(q)),
    );
    return groupTasks(shown, today);
  }, [live, search.done, search.project, search.q, today]);

  const update = (patch: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const overdue = open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length;
  const summary =
    open.length === 0
      ? `Nothing open is assigned to you in ${workspace.name}.`
      : `${open.length} open task${open.length === 1 ? "" : "s"} assigned to you` +
        (overdue ? `, ${overdue} overdue.` : ".");

  return (
    <Page>
      <PageHeader title="My work" description={summary} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-[34px] min-w-[200px] flex-[1_1_220px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-muted focus-within:border-accent">
          <Search size={14} aria-hidden />
          <span className="sr-only">Filter my tasks</span>
          <input
            type="search"
            value={search.q ?? ""}
            onChange={(e) => update({ q: e.target.value || undefined })}
            placeholder="Filter by title or ID"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
        <MenuRoot>
          <MenuTrigger className="h-[34px] rounded-md border border-line-strong bg-canvas px-2.5 text-sm text-ink hover:bg-hover">
            {project?.name ?? "All projects"}
          </MenuTrigger>
          <MenuPopup className="min-w-[200px]">
            {[{ id: undefined, name: "All projects" }, ...myProjects].map((p) => (
              <MenuItem
                key={p.id ?? "all"}
                onClick={() => update({ project: p.id })}
                className={p.id === search.project ? "font-semibold text-accent-hover" : undefined}
              >
                {p.name}
              </MenuItem>
            ))}
          </MenuPopup>
        </MenuRoot>
        <button
          type="button"
          aria-pressed={!!search.done}
          onClick={() => update({ done: search.done ? undefined : true })}
          className={cn(
            "inline-flex h-[34px] items-center gap-2 rounded-md border px-2.5 text-sm text-ink-2",
            search.done ? "border-accent-line bg-accent-soft" : "border-line-strong bg-canvas hover:bg-hover",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "box-border inline-flex size-3.5 items-center justify-center rounded-[4px] border-[1.5px]",
              search.done ? "border-accent bg-accent" : "border-faint bg-canvas",
            )}
          >
            {search.done ? <Check size={10} strokeWidth={3.6} className="text-white" /> : null}
          </span>
          Show completed
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="m-0 text-base font-semibold">
            {live.length === 0 ? "Nothing is assigned to you yet" : "No tasks match"}
          </p>
          <p className="m-0 mt-1 text-sm text-muted">
            {live.length === 0
              ? "Tasks assigned to you in any project show up here."
              : search.done
                ? "Try another project or search."
                : "Try another project or search, or show completed tasks."}
          </p>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className="flex flex-col gap-1.5">
          <h2
            id={`group-${group.id}`}
            className={cn("m-0 flex items-center gap-2 text-sm font-semibold", group.id === "overdue" ? "text-danger-ink" : "text-ink")}
          >
            {group.name}
            <span className="text-xs font-medium text-muted">{group.tasks.length}</span>
          </h2>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-line p-0">
            {group.tasks.map((task) => (
              <MyTaskRow
                key={task.id}
                workspaceId={workspaceId}
                task={task}
                group={group.id}
                project={projectById.get(task.projectId)!}
                parent={task.parentTaskId ? tasks.find((t) => t.id === task.parentTaskId) : undefined}
                today={today}
                selected={task.id === search.task}
                onOpen={() => update({ task: task.id })}
              />
            ))}
          </ul>
        </section>
      ))}

      {search.task ? (
        <MyTaskPanel
          workspaceId={workspaceId}
          taskId={search.task}
          tasks={tasks}
          onClose={() => {
            update({ task: undefined });
            // The panel can change things this list does not mirror (subtasks,
            // reassignment); reload it behind the cached copy.
            void queryClient.invalidateQueries({ queryKey: keys.myTasks(workspaceId) });
          }}
        />
      ) : null}
    </Page>
  );
}

function MyTaskRow({
  workspaceId,
  task,
  group,
  project,
  parent,
  today,
  selected,
  onOpen,
}: {
  workspaceId: string;
  task: Task;
  group: GroupId;
  project: ProjectListItem;
  parent?: Task;
  today: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const save = useUpdateTask(workspaceId, task.projectId);
  const done = task.status === "DONE";
  const cancelled = task.status === "CANCELLED";
  const due = task.dueDate ? dueLabel(task.dueDate, today) : null;

  return (
    <li
      className={cn(
        "group flex min-h-[46px] items-center gap-3 border-b border-line-soft bg-canvas px-3 py-2 last:border-b-0 hover:bg-row-hover",
        selected && "bg-accent-tint hover:bg-accent-tint",
      )}
    >
      {cancelled ? (
        <Ban size={16} className="shrink-0 text-muted" aria-label="Cancelled" />
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reopen ${task.key}` : `Mark ${task.key} done`}
          disabled={save.isPending}
          // Reopening puts it back to To do; the panel offers every status.
          onClick={() => save.mutate({ id: task.id, patch: { status: done ? "TODO" : "DONE" } })}
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted hover:text-success"
        >
          {done ? (
            <CircleCheck size={18} className="text-success" aria-hidden />
          ) : (
            <span aria-hidden className="box-border size-4 rounded-full border-[1.5px] border-faint group-hover:border-success" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left"
      >
        <span className={cn("max-w-full truncate text-sm font-medium", done || cancelled ? "text-muted" : "text-ink")}>
          {task.title}
        </span>
        <span className="flex max-w-full items-center gap-1.5 truncate text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-[3px]"
            style={{ background: project.color }}
          />
          <span className="truncate">
            {project.name} · {task.key}
            {parent ? ` · Subtask of ${parent.title}` : task.parentTaskId ? " · Subtask" : ""}
          </span>
        </span>
      </button>

      <span className="hidden items-center gap-1.5 text-xs text-ink-2 sm:inline-flex" title={STATUSES[task.status].name}>
        <StatusDot status={task.status} />
        <span className="w-[74px] truncate">{STATUSES[task.status].name}</span>
      </span>
      <span className="hidden w-[84px] shrink-0 sm:inline-flex" title={`${PRIORITIES[task.priority].name} priority`}>
        <PriorityChip priority={task.priority} />
      </span>
      <span
        className={cn(
          "w-[78px] shrink-0 text-right text-xs",
          group === "overdue" ? "font-medium text-danger-ink" : group === "today" ? "font-medium text-ink" : "text-muted",
        )}
      >
        {due ?? ""}
        {due ? <span className="sr-only"> due</span> : null}
      </span>
    </li>
  );
}

/** The task panel for a task from any project: loads that project first. */
function MyTaskPanel({
  workspaceId,
  taskId,
  tasks,
  onClose,
}: {
  workspaceId: string;
  taskId: string;
  tasks: Task[];
  onClose: () => void;
}) {
  const listed = tasks.find((t) => t.id === taskId);
  // A link can name a task that is not (or no longer) assigned to the user.
  const single = useQuery({ ...taskQuery(taskId), enabled: !listed });
  const projectId = listed?.projectId ?? single.data?.projectId;
  const project = useQuery({ ...projectQuery(projectId ?? ""), enabled: !!projectId });
  if (!project.data) return null;
  return <TaskPanel workspaceId={workspaceId} project={project.data} taskId={taskId} onClose={onClose} />;
}
