import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskToolbar } from "@/components/tasks/task-toolbar";
import {
  meQuery,
  projectLabelsQuery,
  projectQuery,
  projectTasksQuery,
} from "@/lib/queries";
import { DEFAULT_SORT, hasFilters, matchesFilters, sortTasks, taskSearchSchema, type TaskSearch } from "@/lib/task-filters";

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/board")({
  validateSearch: taskSearchSchema,
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    Promise.all([
      queryClient.ensureQueryData(projectTasksQuery(projectId)),
      queryClient.ensureQueryData(projectLabelsQuery(projectId)),
    ]),
  component: BoardPage,
});

function BoardPage() {
  const { workspaceId, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(projectId));
  const { data: labels } = useSuspenseQuery(projectLabelsQuery(projectId));
  const { data: me } = useSuspenseQuery(meQuery);

  // The board shows top-level tasks; subtasks appear as progress on their parent.
  const topLevel = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks]);
  const visible = useMemo(
    () => sortTasks(topLevel.filter((t) => matchesFilters(t, search, me.id)), search.sort),
    [topLevel, search, me.id],
  );

  const update = (patch: Partial<TaskSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <>
      <TaskToolbar
        search={search}
        onChange={update}
        labels={labels}
        shown={visible.length}
        total={topLevel.length}
      />
      <TaskBoard
        workspaceId={workspaceId}
        project={project}
        allTasks={tasks}
        visible={visible}
        filtering={hasFilters(search)}
        manual={(search.sort ?? DEFAULT_SORT) === "manual"}
        selectedId={search.task}
        onOpen={(task) => update({ task })}
      />
    </>
  );
}
