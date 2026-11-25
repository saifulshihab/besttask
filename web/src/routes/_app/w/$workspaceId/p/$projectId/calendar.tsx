import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { TaskToolbar } from "@/components/tasks/task-toolbar";
import { currentMonth, MONTH_PATTERN } from "@/lib/calendar";
import { meQuery, projectLabelsQuery, projectQuery, projectTasksQuery } from "@/lib/queries";
import { matchesFilters, sortTasks, taskSearchSchema, todayString, type TaskSearch } from "@/lib/task-filters";

const calendarSearchSchema = taskSearchSchema.extend({
  /** The month shown, YYYY-MM; omitted for the current month. */
  month: z.string().regex(MONTH_PATTERN).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/calendar")({
  validateSearch: calendarSearchSchema,
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    Promise.all([
      queryClient.ensureQueryData(projectTasksQuery(projectId)),
      queryClient.ensureQueryData(projectLabelsQuery(projectId)),
    ]),
  component: CalendarPage,
});

function CalendarPage() {
  const { workspaceId, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(projectId));
  const { data: labels } = useSuspenseQuery(projectLabelsQuery(projectId));
  const { data: me } = useSuspenseQuery(meQuery);

  // Like the board, the calendar shows top-level tasks.
  const topLevel = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks]);
  const visible = useMemo(
    () => sortTasks(topLevel.filter((t) => matchesFilters(t, search, me.id)), search.sort),
    [topLevel, search, me.id],
  );

  const update = (patch: Partial<TaskSearch> & { month?: string }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const month = search.month ?? currentMonth();

  return (
    <>
      <TaskToolbar
        search={search}
        onChange={update}
        labels={labels}
        shown={visible.length}
        total={topLevel.length}
      />
      <TaskCalendar
        workspaceId={workspaceId}
        project={project}
        visible={visible}
        month={month}
        today={todayString()}
        selectedId={search.task}
        onMonth={(next) => update({ month: next === currentMonth() ? undefined : next })}
        onOpen={(task) => update({ task })}
      />
    </>
  );
}
