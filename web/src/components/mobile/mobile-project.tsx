import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, ChevronDown, Columns3, Ellipsis, Plus, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { Suspense, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast, toastError } from "@/lib/toast";
import { NameDialog } from "@/components/shell/name-dialog";
import { useActivityFeed } from "@/components/activity/activity-feed";
import { Avatar } from "@/components/ui/avatar";
import { SearchClear } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { PriorityIcon, StatusDot } from "@/components/tasks/task-badges";
import { cn } from "@/lib/cn";
import { PRIORITIES, ROLE_LABELS, STATUSES, STATUS_ORDER } from "@/lib/design";
import { relativeTime } from "@/lib/format";
import { signOut, useCreateProject, useCreateTask, useMoveTask } from "@/lib/mutations";
import {
  meQuery,
  projectsQuery,
  projectTasksQuery,
  workspaceQuery,
  workspacesQuery,
} from "@/lib/queries";
import { formatDue, sortTasks } from "@/lib/task-filters";
import { useDeleteTask, useUpdateTask } from "@/lib/task-mutations";
import type { Me, Priority, ProjectDetail, Task, TaskStatus } from "@/lib/types";
import { useUpdateProfile } from "@/lib/workspace-mutations";
import { Sheet, sheetInput } from "./sheet";

type Page = "board" | "mine" | "activity" | "more";
type SheetState =
  | { kind: "move"; task: Task }
  | { kind: "task"; taskId: string }
  | { kind: "create" }
  | { kind: "filters" }
  | { kind: "projects" }
  | null;

const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const pill = (on: boolean) =>
  cn(
    "shrink-0 rounded-full border text-sm",
    on ? "border-ink bg-ink font-semibold text-canvas" : "border-line bg-transparent text-ink-2",
  );

/**
 * The prototype's mobile screen (M01–M05): one project at a time, status
 * tabs instead of columns, bottom navigation and bottom sheets.
 */
export function MobileProject({ workspaceId, project }: { workspaceId: string; project: ProjectDetail }) {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const tasksQuery = useQuery(projectTasksQuery(project.id));
  const tasks = useMemo(() => (tasksQuery.data ?? []).filter((t) => !t.parentTaskId), [tasksQuery.data]);
  const move = useMoveTask(workspaceId, project.id);
  const [page, setPage] = useState<Page>("board");
  const [tab, setTab] = useState<TaskStatus>("TODO");
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [mineOnly, setMineOnly] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const editable = !project.archivedAt;

  const statuses = STATUS_ORDER.filter((s) => s !== "CANCELLED" || project.showCancelled);
  const searching = searchOpen && q.trim().length > 0;
  const filtering = priorities.length > 0 || mineOnly;
  const pool = tasks.filter(
    (t) =>
      (!priorities.length || priorities.includes(t.priority)) && (!mineOnly || t.assigneeId === me.id),
  );
  const cards = sortTasks(
    searching
      ? tasks.filter((t) => `${t.key} ${t.title}`.toLowerCase().includes(q.trim().toLowerCase()))
      : page === "mine"
        ? tasks.filter((t) => t.assigneeId === me.id)
        : pool.filter((t) => t.status === tab),
  );
  const title =
    page === "board" ? project.name : page === "mine" ? "My tasks" : page === "activity" ? "Activity" : "More";
  const close = () => setSheet(null);

  return (
    <div className="relative flex min-h-svh flex-col bg-row-hover text-ink">
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => setSheet({ kind: "projects" })}
          className="flex min-h-11 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-left text-ink"
        >
          <span
            className="flex size-7 items-center justify-center rounded-[7px] text-2xs font-bold text-white"
            style={{ background: project.color }}
          >
            {project.key.slice(0, 2)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-muted">{workspace.name}</span>
            <span className="flex items-center gap-1 truncate text-lg font-bold">
              {title}
              <ChevronDown size={16} aria-hidden />
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label="Search tasks"
          aria-pressed={searchOpen}
          onClick={() => (setSearchOpen((o) => !o), setQ(""))}
          className="flex size-11 items-center justify-center rounded-xl bg-canvas text-ink"
        >
          <Search size={18} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Filters"
          onClick={() => setSheet({ kind: "filters" })}
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            filtering ? "bg-ink text-canvas" : "bg-canvas text-ink",
          )}
        >
          <SlidersHorizontal size={18} aria-hidden />
        </button>
      </header>

      {searchOpen ? (
        <label className="mx-4 mb-2 flex h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3">
          <span className="sr-only">Search tasks</span>
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all tasks"
            className="min-w-0 flex-1 border-0 bg-transparent text-md text-ink outline-none"
          />
          {q ? <SearchClear onClear={() => setQ("")} className="size-7" /> : null}
        </label>
      ) : null}

      {page === "board" && !searching ? (
        <div role="tablist" aria-label="Status" className="flex gap-2 overflow-x-auto px-4 pt-2 pb-3">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={cn(pill(tab === s), "h-9 px-3.5")}
            >
              {STATUSES[s].name} {pool.filter((t) => t.status === s).length}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-1 pb-[150px]">
        {page === "board" || page === "mine" || searching ? (
          <>
            {page === "mine" && !searching ? <h1 className="my-1 text-xl font-bold">My tasks</h1> : null}
            {cards.map((task) => (
              <article key={task.id} className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3.5">
                <button
                  type="button"
                  onClick={() => setSheet({ kind: "task", taskId: task.id })}
                  className="flex gap-2 border-0 bg-transparent p-0 text-left text-ink"
                >
                  <span className="pt-0.5 text-xs font-medium text-muted">{task.key}</span>
                  <span
                    className={cn(
                      "flex-1 text-md leading-[1.4] font-medium",
                      (task.status === "DONE" || task.status === "CANCELLED") && "text-muted line-through",
                    )}
                  >
                    {task.title}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 items-center rounded-sm border border-line px-2 text-xs text-ink-2">
                    {PRIORITIES[task.priority].name}
                  </span>
                  {searching || page === "mine" ? (
                    <span className="inline-flex h-6 items-center rounded-sm bg-menu-hover px-2 text-xs text-ink-2">
                      {STATUSES[task.status].name}
                    </span>
                  ) : null}
                  {task.dueDate ? <span className="text-xs text-ink-2">Due {formatDue(task.dueDate)}</span> : null}
                  <span className="flex-1" />
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: "move", task })}
                      className="h-9 rounded-md border border-line bg-transparent px-3 text-sm text-ink-2"
                    >
                      Move
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {cards.length === 0 && !tasksQuery.isPending ? (
              <div className="flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-line p-[22px] text-center">
                <span className="text-base font-medium text-ink-2">
                  {searching
                    ? `No tasks match “${q.trim()}”`
                    : page === "mine"
                      ? "Nothing assigned to you"
                      : filtering
                        ? `No tasks match your filters in ${STATUSES[tab].name}`
                        : `No tasks in ${STATUSES[tab].name}`}
                </span>
                {page === "board" && !searching && editable ? (
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: "create" })}
                    className="h-10 rounded-[10px] border border-line bg-transparent px-3.5 text-sm text-ink"
                  >
                    Add a task here
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : page === "activity" ? (
          <MobileActivity workspaceId={workspaceId} projectId={project.id} />
        ) : (
          <MobileMore workspaceId={workspaceId} project={project} me={me} tasks={tasks} />
        )}
      </div>

      {editable && (page === "board" || page === "mine") ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "create" })}
          className="fixed right-4 bottom-[92px] z-20 flex h-[52px] items-center gap-2 rounded-2xl bg-accent px-[18px] text-md font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden />
          New task
        </button>
      ) : null}

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-20 box-border grid h-[76px] grid-cols-4 border-t border-line bg-canvas pb-3"
      >
        {(
          [
            ["board", "Board", <Columns3 key="b" size={20} aria-hidden />],
            ["mine", "My tasks", <UserRound key="m" size={20} aria-hidden />],
            ["activity", "Activity", <Activity key="a" size={20} aria-hidden />],
            ["more", "More", <Ellipsis key="o" size={20} aria-hidden />],
          ] as [Page, string, ReactNode][]
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            aria-current={page === id ? "page" : undefined}
            onClick={() => (setPage(id), setSearchOpen(false))}
            className={cn(
              "flex flex-col items-center justify-center gap-1 border-0 bg-transparent text-2xs",
              page === id ? "font-semibold text-accent-hover" : "text-muted",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <Sheet open={sheet?.kind === "move"} onOpenChange={(o) => !o && close()} title="Move to">
        {sheet?.kind === "move"
          ? statuses.map((s) => (
              <button
                key={s}
                type="button"
                disabled={sheet.task.status === s}
                onClick={() => {
                  move.mutate(
                    { id: sheet.task.id, status: s },
                    { onError: (error) => toastError(error) },
                  );
                  toast(`Moved ${sheet.task.key} to ${STATUSES[s].name}`);
                  close();
                }}
                className="flex h-12 items-center justify-between rounded-xl border border-line bg-canvas px-3.5 text-left text-md text-ink disabled:opacity-60"
              >
                {STATUSES[s].name}
                {sheet.task.status === s ? <span className="text-xs text-muted">Current</span> : null}
              </button>
            ))
          : null}
      </Sheet>

      {sheet?.kind === "task" ? (
        <TaskSheet
          workspaceId={workspaceId}
          project={project}
          task={tasks.find((t) => t.id === sheet.taskId)}
          me={me}
          statuses={statuses}
          onClose={close}
        />
      ) : null}

      {sheet?.kind === "create" ? (
        <CreateSheet
          workspaceId={workspaceId}
          project={project}
          status={page === "mine" ? project.defaultStatus : tab}
          assignToMe={page === "mine"}
          meId={me.id}
          onClose={close}
        />
      ) : null}

      <Sheet open={sheet?.kind === "filters"} onOpenChange={(o) => !o && close()} title="Filters">
        <span className="text-sm text-muted">Priority</span>
        <div className="flex flex-wrap gap-2">
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priorities.includes(p)}
              onClick={() =>
                setPriorities((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
              }
              className={cn(pill(priorities.includes(p)), "h-10 px-3.5 text-base")}
            >
              {PRIORITIES[p].name}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={mineOnly}
          onClick={() => setMineOnly((m) => !m)}
          className={cn(
            "h-[46px] rounded-xl border text-base",
            mineOnly ? "border-ink bg-ink font-semibold text-canvas" : "border-line bg-transparent text-ink-2",
          )}
        >
          Only tasks assigned to me
        </button>
        <button
          type="button"
          onClick={() => (setPriorities([]), setMineOnly(false))}
          className="h-[46px] border-0 bg-transparent text-base font-semibold text-accent-hover"
        >
          Clear filters
        </button>
      </Sheet>

      {sheet?.kind === "projects" ? (
        <ProjectsSheet workspaceId={workspaceId} current={project} owner={workspace.role === "WORKSPACE_OWNER"} onClose={close} />
      ) : null}
    </div>
  );
}

function TaskSheet({
  workspaceId,
  project,
  task,
  me,
  statuses,
  onClose,
}: {
  workspaceId: string;
  project: ProjectDetail;
  task?: Task;
  me: Me;
  statuses: TaskStatus[];
  onClose: () => void;
}) {
  const update = useUpdateTask(workspaceId, project.id);
  const remove = useDeleteTask(workspaceId, project.id);
  const [title, setTitle] = useState(task?.title ?? "");
  const editable = !project.archivedAt;
  if (!task) return null;
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) => update.mutate({ id: task.id, patch });
  const mine = task.assigneeId === me.id;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={task.key}>
      <fieldset disabled={!editable} className="m-0 flex flex-col gap-3 border-0 p-0">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Title</span>
          <input
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== task.title && save({ title: title.trim() })}
            className={sheetInput}
          />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="m-status" className="text-xs text-muted">Status</label>
            <Select
              id="m-status"
              size="xl"
              value={task.status}
              onValueChange={(status) => save({ status })}
              className="border-line"
              options={statuses.map((s) => ({ value: s, label: STATUSES[s].name, icon: <StatusDot status={s} /> }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="m-priority" className="text-xs text-muted">Priority</label>
            <Select
              id="m-priority"
              size="xl"
              value={task.priority}
              onValueChange={(priority) => save({ priority })}
              className="border-line"
              options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITIES[p].name, icon: <PriorityIcon priority={p} /> }))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-due" className="text-xs text-muted">Due date</label>
          <DatePicker
            id="m-due"
            size="lg"
            value={task.dueDate?.slice(0, 10) ?? null}
            placeholder="No due date"
            onChange={(day) => save({ dueDate: day ? `${day}T00:00:00.000Z` : null })}
            className="border-line"
          />
        </div>
        <button
          type="button"
          onClick={() => save({ assigneeId: mine ? null : me.id })}
          className="h-[46px] rounded-xl border border-line bg-transparent text-base text-ink"
        >
          {mine ? "Unassign me" : "Assign to me"}
        </button>
        <button
          type="button"
          onClick={() => remove.mutate(task, { onSuccess: onClose })}
          className="h-[46px] rounded-xl border-0 bg-transparent text-base font-semibold text-danger"
        >
          Delete task
        </button>
      </fieldset>
    </Sheet>
  );
}

function CreateSheet({
  workspaceId,
  project,
  status,
  assignToMe,
  meId,
  onClose,
}: {
  workspaceId: string;
  project: ProjectDetail;
  status: TaskStatus;
  assignToMe: boolean;
  meId: string;
  onClose: () => void;
}) {
  const create = useCreateTask(workspaceId, project.id);
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), status, priority: project.defaultPriority, assigneeId: assignToMe ? meId : null },
      {
        onSuccess: (task) => (toast(`Created ${task.key}`), onClose()),
        onError: (error) => toastError(error),
      },
    );
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="New task">
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Title</span>
          <input
            autoFocus
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className={sheetInput}
          />
        </label>
        <span className="text-sm text-muted">
          Adds to {STATUSES[status].name}
          {assignToMe ? ", assigned to you" : ""}
        </span>
        <button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="h-12 rounded-xl border-0 bg-accent text-md font-semibold text-white"
        >
          Create task
        </button>
      </form>
    </Sheet>
  );
}

function ProjectsSheet({
  workspaceId,
  current,
  owner,
  onClose,
}: {
  workspaceId: string;
  current: ProjectDetail;
  owner: boolean;
  onClose: () => void;
}) {
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const navigate = useNavigate();
  const create = useCreateProject(workspaceId);
  const [naming, setNaming] = useState(false);
  return (
    <>
      <Sheet open={!naming} onOpenChange={(o) => !o && onClose()} title="Projects">
        {projects
          .filter((p) => !p.archivedAt)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onClose();
                void navigate({ to: "/w/$workspaceId/p/$projectId/board", params: { workspaceId, projectId: p.id } });
              }}
              className="flex h-[52px] items-center gap-2.5 rounded-xl border border-line bg-canvas px-3.5 text-left text-md text-ink"
            >
              <span
                className="flex size-6 items-center justify-center rounded-md text-[10px] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.key.slice(0, 2)}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted">{p.id === current.id ? "Current" : p._count.tasks}</span>
            </button>
          ))}
        {/* Project creation is owner-only on mobile too (M05). */}
        {owner ? (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="h-[46px] rounded-xl border border-dashed border-line-strong bg-transparent text-base text-ink-2"
          >
            + New project
          </button>
        ) : null}
      </Sheet>
      <NameDialog
        open={naming}
        onOpenChange={(open) => !open && (setNaming(false), create.reset())}
        title="New project"
        label="Project name"
        placeholder="e.g. Website relaunch"
        submitLabel="Create project"
        pending={create.isPending}
        error={create.error?.message}
        onSubmit={(name) =>
          create.mutate(name, {
            onSuccess: (project) => {
              onClose();
              void navigate({
                to: "/w/$workspaceId/p/$projectId/board",
                params: { workspaceId, projectId: project.id },
              });
            },
          })
        }
      />
    </>
  );
}

function MobileActivity({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  return (
    <>
      <h1 className="my-1 text-xl font-bold">Activity</h1>
      <Suspense fallback={<p className="py-6 text-center text-muted">Loading activity…</p>}>
        <MobileActivityList workspaceId={workspaceId} projectId={projectId} />
      </Suspense>
    </>
  );
}

function MobileActivityList({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const feed = useActivityFeed(workspaceId, { projectId });
  return (
    <>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {feed.entries.map((e) => (
          <li key={e.id} className="flex gap-2.5 border-b border-line py-3">
            {e.event.actor ? <Avatar user={e.event.actor} /> : <span className="size-7 shrink-0" />}
            <span className="flex-1 text-base leading-[1.45]">
              {e.event.actor?.name ?? "Someone"} {e.verb} {e.target ? <b className="font-semibold">{e.target}</b> : null}
              {e.tail}
              <span className="mt-0.5 block text-xs text-muted">{relativeTime(e.event.createdAt)}</span>
            </span>
          </li>
        ))}
        {feed.entries.length === 0 ? <li className="py-6 text-center text-muted">Nothing has happened here yet.</li> : null}
      </ol>
      {feed.hasMore ? (
        <button
          type="button"
          onClick={feed.loadMore}
          disabled={feed.loading}
          className="mt-2 h-[46px] rounded-xl border border-line bg-canvas text-base font-medium text-ink disabled:opacity-60"
        >
          {feed.loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </>
  );
}

function MobileMore({
  workspaceId,
  project,
  me,
  tasks,
}: {
  workspaceId: string;
  project: ProjectDetail;
  me: Me;
  tasks: Task[];
}) {
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: workspaces } = useSuspenseQuery(workspacesQuery);
  const update = useUpdateProfile();
  const owner = workspace.role === "WORKSPACE_OWNER";
  const link = "flex min-h-12 items-center px-3.5 text-base text-ink no-underline border-b border-line last:border-b-0";
  return (
    <>
      <h1 className="my-1 text-xl font-bold">More</h1>
      <div className="overflow-hidden rounded-xl border border-line bg-canvas">
        <div className="flex items-center gap-3 p-3.5">
          <Avatar user={me} size="lg" />
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">{me.name}</span>
            <span className="text-xs text-muted">
              {owner ? `Owner of ${workspace.name}` : `${ROLE_LABELS[project.role]} on ${project.name}`}
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-3.5">
        <span className="text-sm font-semibold">Appearance</span>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              aria-pressed={me.theme === theme}
              onClick={() => update.mutate({ theme })}
              className={cn(
                "h-11 rounded-[10px] text-base capitalize",
                me.theme === theme
                  ? "border-2 border-accent-hover bg-menu-hover font-semibold text-ink"
                  : "border border-line bg-transparent text-ink-2",
              )}
            >
              {theme === "system" ? "System" : theme}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-canvas p-3.5">
        <span className="text-sm font-semibold">Summary</span>
        <span className="text-sm text-ink-2">
          {tasks.length} tasks · {tasks.filter((t) => t.status === "DONE").length} done ·{" "}
          {tasks.filter((t) => t.assigneeId === me.id).length} assigned to you
        </span>
      </div>
      <nav aria-label="More pages" className="overflow-hidden rounded-xl border border-line bg-canvas">
        <Link to="/w/$workspaceId/p/$projectId/list" params={{ workspaceId, projectId: project.id }} className={link}>
          List view
        </Link>
        {project.role !== "MEMBER" ? (
          <Link to="/w/$workspaceId/p/$projectId/settings" params={{ workspaceId, projectId: project.id }} className={link}>
            Project settings
          </Link>
        ) : null}
        <Link to="/w/$workspaceId/p/$projectId/members" params={{ workspaceId, projectId: project.id }} className={link}>
          Project members
        </Link>
        {owner ? (
          <>
            <Link to="/w/$workspaceId/members" params={{ workspaceId }} className={link}>
              Workspace members
            </Link>
            <Link to="/w/$workspaceId/settings" params={{ workspaceId }} className={link}>
              Workspace settings
            </Link>
          </>
        ) : null}
        <Link to="/w/$workspaceId/profile" params={{ workspaceId }} className={link}>
          Profile
        </Link>
        <Link to="/w/$workspaceId/account" params={{ workspaceId }} className={link}>
          Account settings
        </Link>
      </nav>
      {workspaces.length > 1 ? (
        <nav aria-label="Workspaces" className="overflow-hidden rounded-xl border border-line bg-canvas">
          {workspaces.map((w) => (
            <Link key={w.id} to="/w/$workspaceId" params={{ workspaceId: w.id }} className={link}>
              <span className="flex-1">{w.name}</span>
              {w.id === workspaceId ? <span className="text-xs text-muted">Current</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
      <button
        type="button"
        onClick={() => void signOut()}
        className="h-12 rounded-xl border border-line bg-transparent text-base font-semibold text-danger"
      >
        Sign out
      </button>
    </>
  );
}
