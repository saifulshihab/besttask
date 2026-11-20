import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { clearTokens, getTokens } from "./auth";
import { keys } from "./queries";
import type { Priority, Project, Task, TaskStatus, Workspace } from "./types";

/**
 * Shell mutations. Each updates or invalidates only the keys it affects;
 * see the note on `keys` in queries.ts.
 */

export const useCreateWorkspace = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Workspace>("/workspaces", { method: "POST", body: { name } }),
    onSuccess: (workspace) => {
      qc.setQueryData(keys.workspace(workspace.id), workspace);
      void qc.invalidateQueries({ queryKey: keys.workspaces, exact: true });
    },
  });
};

export const useCreateProject = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Project>(`/workspaces/${workspaceId}/projects`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
        // The workspace's project count changes too.
        qc.invalidateQueries({
          queryKey: keys.workspace(workspaceId),
          exact: true,
        }),
      ]),
  });
};

export const useRestoreProject = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api<Project>(`/projects/${projectId}/unarchive`, { method: "POST" }),
    onSuccess: (_, projectId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
        qc.invalidateQueries({ queryKey: keys.project(projectId) }),
      ]),
  });
};

export interface NewTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  /** Set to create a subtask. */
  parentTaskId?: string;
}

const isOpen = (status: TaskStatus) => status !== "DONE" && status !== "CANCELLED";

export const useCreateTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTask) =>
      api<Task>(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: { ...input, assigneeId: input.assigneeId ?? undefined },
      }),
    onSuccess: (task) => {
      // The response is the full task, so it goes straight into the board's
      // cache instead of refetching the whole list.
      qc.setQueryData<Task[]>(keys.projectTasks(projectId), (tasks) =>
        tasks ? [...tasks, task] : tasks,
      );
      if (isOpen(task.status))
        void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
    },
  });
};

/**
 * Moves a task to another status column. The cache updates before the
 * request is sent, so the card moves instantly; a failed request puts it back.
 */
export const useMoveTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  const tasksKey = keys.projectTasks(projectId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api<Task>(`/tasks/${id}/status`, { method: "PATCH", body: { status } }),
    onMutate: async ({ id, status }) => {
      // A refetch landing mid-move would overwrite the optimistic state.
      await qc.cancelQueries({ queryKey: tasksKey });
      const previous = qc.getQueryData<Task[]>(tasksKey);
      const from = previous?.find((t) => t.id === id)?.status;
      // The API puts a task whose status changes at the end of its new column.
      const end = Math.max(0, ...(previous ?? []).map((t) => t.position)) + 1;
      qc.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                position: t.status === status ? t.position : end,
                completedAt: status === "DONE" ? new Date().toISOString() : null,
              }
            : t,
        ),
      );
      return { previous, from };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(tasksKey, context.previous);
    },
    onSuccess: (task, { status }, context) => {
      qc.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((t) => (t.id === task.id ? task : t)),
      );
      // The sidebar shows open-task counts; only crossing open/closed changes them.
      if (context?.from && isOpen(context.from) !== isOpen(status))
        void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
    },
  });
};

/**
 * Drag and drop: put a task in `status` just before `beforeId` (or last). The
 * board shows the new order at once; the server's renumbered column follows.
 */
export const useReorderTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  const tasksKey = keys.projectTasks(projectId);
  return useMutation({
    mutationFn: ({ id, status, beforeId }: { id: string; status: TaskStatus; beforeId: string | null }) =>
      api<{ task: Task; order: { id: string; position: number }[] }>(`/tasks/${id}/move`, {
        method: "POST",
        body: { status, beforeId },
      }),
    onMutate: async ({ id, status, beforeId }) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const previous = qc.getQueryData<Task[]>(tasksKey);
      const moving = previous?.find((t) => t.id === id);
      if (!previous || !moving) return { previous, from: moving?.status };
      // Same renumbering as the server: the column in order, the task inserted.
      const column = previous
        .filter((t) => t.status === status && !t.parentTaskId && t.id !== id)
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
        .map((t) => t.id);
      const at = beforeId ? column.indexOf(beforeId) : -1;
      column.splice(at === -1 ? column.length : at, 0, id);
      const rank = new Map(column.map((taskId, i) => [taskId, i + 1]));
      qc.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                position: rank.get(id)!,
                completedAt:
                  status === t.status ? t.completedAt : status === "DONE" ? new Date().toISOString() : null,
              }
            : rank.has(t.id)
              ? { ...t, position: rank.get(t.id)! }
              : t,
        ),
      );
      return { previous, from: moving.status };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(tasksKey, context.previous);
    },
    onSuccess: ({ task, order }, { status }, context) => {
      const rank = new Map(order.map((o) => [o.id, o.position]));
      qc.setQueryData<Task[]>(tasksKey, (tasks) =>
        tasks?.map((t) => (t.id === task.id ? task : rank.has(t.id) ? { ...t, position: rank.get(t.id)! } : t)),
      );
      if (context?.from && isOpen(context.from) !== isOpen(status))
        void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
    },
  });
};

/** Revokes the refresh token server-side, then forgets the session locally. */
export const signOut = async () => {
  const refreshToken = getTokens()?.refreshToken;
  try {
    if (refreshToken)
      await api("/auth/logout", {
        method: "POST",
        body: { refreshToken },
        anonymous: true,
      });
  } finally {
    clearTokens();
  }
};
