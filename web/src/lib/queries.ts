import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api, apiAll } from "./api";
import type {
  ActivityEvent,
  Paginated,
  Candidate,
  Comment,
  Label,
  Me,
  ProjectDetail,
  ProjectListItem,
  ProjectPerson,
  SavedView,
  Task,
  Workspace,
  WorkspaceMember,
  WorkspaceStats,
} from "./types";

/**
 * Every cache key in the app comes from here. Mutations invalidate the
 * narrowest key that covers what they changed, never the whole cache: a bare
 * invalidateQueries() refetches every mounted query after each click.
 *
 * Keys nest, so invalidating keys.project(id) also covers its members.
 */
export const keys = {
  me: ["me"] as const,
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  projects: (workspaceId: string) => ["workspace", workspaceId, "projects"] as const,
  project: (id: string) => ["project", id] as const,
  projectMembers: (id: string) => ["project", id, "members"] as const,
  /** Every task in the project, subtasks included; board and list filter locally. */
  projectTasks: (id: string) => ["project", id, "tasks"] as const,
  projectLabels: (id: string) => ["project", id, "labels"] as const,
  projectCandidates: (id: string) => ["project", id, "candidates"] as const,
  projectViews: (id: string) => ["project", id, "views"] as const,
  task: (id: string) => ["task", id] as const,
  taskComments: (id: string) => ["task", id, "comments"] as const,
  taskActivity: (id: string) => ["task", id, "activity"] as const,
  activity: (workspaceId: string, filters: ActivityFilters = {}) =>
    ["workspace", workspaceId, "activity", filters] as const,
  workspaceMembers: (id: string) => ["workspace", id, "members"] as const,
  workspaceStats: (id: string) => ["workspace", id, "stats"] as const,
  /** Tasks assigned to the signed-in user across a workspace (My work). */
  myTasks: (workspaceId: string) => ["my-tasks", workspaceId] as const,
  /** Prefix covering every workspace's My work list. */
  allMyTasks: ["my-tasks"] as const,
};

export interface ActivityFilters {
  projectId?: string;
}

export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: ({ signal }) => api<Me>("/auth/me", { signal }),
  staleTime: 5 * 60_000,
});

export const workspacesQuery = queryOptions({
  queryKey: keys.workspaces,
  queryFn: ({ signal }) => apiAll<Workspace>("/workspaces", {}, signal),
});

export const workspaceQuery = (id: string) =>
  queryOptions({
    queryKey: keys.workspace(id),
    queryFn: ({ signal }) => api<Workspace>(`/workspaces/${id}`, { signal }),
  });

export const projectsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: keys.projects(workspaceId),
    queryFn: ({ signal }) =>
      apiAll<ProjectListItem>(
        `/workspaces/${workspaceId}/projects`,
        { includeArchived: true },
        signal,
      ),
  });

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: keys.project(id),
    queryFn: ({ signal }) => api<ProjectDetail>(`/projects/${id}`, { signal }),
  });

export const projectTasksQuery = (id: string) =>
  queryOptions({
    queryKey: keys.projectTasks(id),
    queryFn: ({ signal }) => apiAll<Task>(`/projects/${id}/tasks`, {}, signal),
  });

export const projectLabelsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.projectLabels(id),
    queryFn: ({ signal }) => api<Label[]>(`/projects/${id}/labels`, { signal }),
  });

export const projectMembersQuery = (id: string) =>
  queryOptions({
    queryKey: keys.projectMembers(id),
    queryFn: ({ signal }) =>
      api<ProjectPerson[]>(`/projects/${id}/members`, { signal }),
  });

export const projectCandidatesQuery = (id: string) =>
  queryOptions({
    queryKey: keys.projectCandidates(id),
    queryFn: ({ signal }) =>
      api<Candidate[]>(`/projects/${id}/candidates`, { signal }),
  });

export const projectViewsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.projectViews(id),
    queryFn: ({ signal }) =>
      api<SavedView[]>(`/projects/${id}/views`, { signal }),
  });

/** A single task, for links to tasks outside the current project's cache. */
export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: keys.task(id),
    queryFn: ({ signal }) => api<Task>(`/tasks/${id}`, { signal }),
  });

export const taskCommentsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.taskComments(id),
    queryFn: ({ signal }) =>
      apiAll<Comment>(`/tasks/${id}/comments`, {}, signal),
  });

/**
 * The task's own events, newest first, 20 per page (comments come from
 * taskCommentsQuery). The panel timeline asks for more pages as needed.
 */
export const taskActivityQuery = (workspaceId: string, taskId: string) =>
  infiniteQueryOptions({
    queryKey: keys.taskActivity(taskId),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<ActivityEvent>>(`/workspaces/${workspaceId}/activity`, {
        query: { entityId: taskId, page: pageParam, pageSize: 20 },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });

/** Events per request; the feed shows this many entries per "Load more". */
export const ACTIVITY_PAGE_SIZE = 20;

/**
 * Activity, newest first, a page at a time (infinite query). The feed fetches
 * more pages as the reader asks for them; see useActivityFeed.
 */
export const activityQuery = (workspaceId: string, filters: ActivityFilters = {}) =>
  infiniteQueryOptions({
    queryKey: keys.activity(workspaceId, filters),
    queryFn: ({ pageParam, signal }) =>
      api<Paginated<ActivityEvent>>(`/workspaces/${workspaceId}/activity`, {
        query: { ...filters, page: pageParam, pageSize: ACTIVITY_PAGE_SIZE },
        signal,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    // Any change anywhere adds events; show the cache, then refresh on visit.
    staleTime: 0,
  });

export const workspaceMembersQuery = (id: string) =>
  queryOptions({
    queryKey: keys.workspaceMembers(id),
    queryFn: ({ signal }) =>
      apiAll<WorkspaceMember>(`/workspaces/${id}/members`, {}, signal),
  });

export const workspaceStatsQuery = (id: string) =>
  queryOptions({
    queryKey: keys.workspaceStats(id),
    queryFn: ({ signal }) =>
      api<WorkspaceStats>(`/workspaces/${id}/stats`, { signal }),
  });

/**
 * Tasks assigned to the signed-in user in every project they can see in the
 * workspace, subtasks included (they are assigned on their own).
 */
export const myTasksQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: keys.myTasks(workspaceId),
    queryFn: ({ signal }) =>
      apiAll<Task>(`/workspaces/${workspaceId}/tasks`, { assigneeId: "me", sort: "dueDate" }, signal),
    // Board drags and other pages change these tasks without touching this
    // list, so it refetches (behind the cached copy) whenever it is opened.
    staleTime: 0,
  });
