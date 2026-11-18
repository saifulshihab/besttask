import { Popover } from "@base-ui/react/popover";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { TaskList } from "@/components/tasks/task-list";
import { TaskToolbar } from "@/components/tasks/task-toolbar";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import {
  meQuery,
  projectLabelsQuery,
  projectQuery,
  projectTasksQuery,
  projectViewsQuery,
} from "@/lib/queries";
import {
  hasFilters,
  matchesFilters,
  sortTasks,
  taskSearchSchema,
  type TaskSearch,
} from "@/lib/task-filters";
import { useDeleteView, useSaveView } from "@/lib/task-mutations";
import type { SavedView } from "@/lib/types";

const listSearchSchema = taskSearchSchema.extend({
  subtasks: z.boolean().optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  /** The saved view currently applied, while its filters are untouched. */
  view: z.string().optional().catch(undefined),
});
type ListSearch = z.infer<typeof listSearchSchema>;

/** The filter keys a saved view stores. */
const VIEW_KEYS = ["q", "status", "priority", "assignee", "label", "sort"] as const;

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/list")({
  validateSearch: listSearchSchema,
  loader: ({ context: { queryClient }, params: { projectId } }) => {
    void queryClient.prefetchQuery(projectViewsQuery(projectId));
    return Promise.all([
      queryClient.ensureQueryData(projectTasksQuery(projectId)),
      queryClient.ensureQueryData(projectLabelsQuery(projectId)),
    ]);
  },
  component: ListPage,
});

function ListPage() {
  const { workspaceId, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(projectId));
  const { data: labels } = useSuspenseQuery(projectLabelsQuery(projectId));
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: views = [] } = useQuery(projectViewsQuery(projectId));

  const topLevel = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks]);
  const visible = useMemo(
    () => sortTasks(topLevel.filter((t) => matchesFilters(t, search, me.id)), search.sort),
    [topLevel, search, me.id],
  );
  const filtering = hasFilters(search);

  const navigateSearch = (next: (prev: ListSearch) => ListSearch) =>
    void navigate({ search: next, replace: true });
  // Changing any filter leaves the saved view and returns to page 1.
  const update = (patch: Partial<TaskSearch>) =>
    navigateSearch((prev) => ({
      ...prev,
      ...patch,
      ...(patch.task === undefined ? { view: undefined, page: undefined } : {}),
    }));

  const applyView = (view: SavedView | null) =>
    navigateSearch((prev) => {
      const next: ListSearch = { subtasks: prev.subtasks, view: view?.id };
      if (view) {
        const parsed = taskSearchSchema.parse(view.filters);
        for (const key of VIEW_KEYS) Object.assign(next, { [key]: parsed[key] });
      }
      return next;
    });

  const activeView = views.find((v) => v.id === search.view);

  return (
    <>
      <TaskToolbar
        search={search}
        onChange={update}
        labels={labels}
        shown={visible.length}
        total={topLevel.length}
        leading={<ViewsMenu views={views} active={activeView} projectId={projectId} onApply={applyView} />}
        beforeSort={
          <button
            type="button"
            aria-pressed={!!search.subtasks}
            onClick={() => navigateSearch((prev) => ({ ...prev, subtasks: prev.subtasks ? undefined : true }))}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm text-ink-2",
              search.subtasks ? "border-accent-line bg-accent-soft" : "border-line-strong bg-canvas hover:bg-hover",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "box-border inline-flex size-3.5 items-center justify-center rounded-[4px] border-[1.5px]",
                search.subtasks ? "border-accent bg-accent" : "border-faint bg-canvas",
              )}
            >
              {search.subtasks ? <Check size={10} strokeWidth={3.6} className="text-white" /> : null}
            </span>
            Show subtasks
          </button>
        }
        afterSort={
          filtering ? (
            <SaveView
              projectId={projectId}
              filters={Object.fromEntries(
                VIEW_KEYS.flatMap((k) => (search[k] === undefined ? [] : [[k, search[k]!]])),
              )}
              onSaved={(view) => navigateSearch((prev) => ({ ...prev, view: view.id }))}
            />
          ) : null
        }
      />
      <TaskList
        workspaceId={workspaceId}
        project={project}
        allTasks={tasks}
        visible={visible}
        filtering={filtering}
        page={search.page ?? 1}
        showSubtasks={!!search.subtasks}
        onPage={(page) => navigateSearch((prev) => ({ ...prev, page: page === 1 ? undefined : page }))}
        onOpen={(task) => navigateSearch((prev) => ({ ...prev, task }))}
      />
    </>
  );
}

function ViewsMenu({
  views,
  active,
  projectId,
  onApply,
}: {
  views: SavedView[];
  active?: SavedView;
  projectId: string;
  onApply: (view: SavedView | null) => void;
}) {
  const remove = useDeleteView(projectId);
  return (
    <MenuRoot>
      <MenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-canvas px-2.5 text-sm font-medium text-ink hover:bg-hover">
        {active?.name ?? "All tasks"}
        <ChevronDown size={14} aria-hidden />
      </MenuTrigger>
      <MenuPopup className="min-w-[220px]">
        <MenuItem onClick={() => onApply(null)}>All tasks</MenuItem>
        {views.map((view) => (
          <div key={view.id} className="flex items-center">
            <MenuItem className="flex-1" onClick={() => onApply(view)}>
              {view.name}
            </MenuItem>
            <button
              type="button"
              aria-label={`Delete view ${view.name}`}
              onClick={() => {
                remove.mutate(view.id);
                if (active?.id === view.id) onApply(null);
              }}
              className="flex size-[30px] items-center justify-center rounded-sm text-muted hover:bg-menu-hover"
            >
              <X size={12} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        ))}
        {views.length === 0 ? (
          <span className="px-2.5 py-1.5 text-xs text-muted">Set filters, then “Save view”.</span>
        ) : null}
      </MenuPopup>
    </MenuRoot>
  );
}

function SaveView({
  projectId,
  filters,
  onSaved,
}: {
  projectId: string;
  filters: SavedView["filters"];
  onSaved: (view: SavedView) => void;
}) {
  const save = useSaveView(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      { name: name.trim(), filters },
      {
        onSuccess: (view) => {
          setOpen(false);
          setName("");
          onSaved(view);
        },
      },
    );
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="h-8 rounded-md border border-accent-line bg-accent-tint px-3 text-sm font-medium text-accent-hover hover:bg-accent-soft">
        Save view
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-30">
          <Popover.Popup className="w-[260px] rounded-lg border border-line bg-canvas p-3 shadow-popover outline-none">
            <form onSubmit={submit} className="flex flex-col gap-2">
              <label htmlFor="viewname" className="text-xs font-semibold">
                View name
              </label>
              <input
                id="viewname"
                autoFocus
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Medium priority, unassigned"
                className="h-[34px] rounded-md border border-line-strong px-2.5 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!name.trim() || save.isPending}
                className="h-[34px] rounded-md bg-accent text-sm font-semibold text-white hover:bg-accent-strong"
              >
                Save view
              </button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
