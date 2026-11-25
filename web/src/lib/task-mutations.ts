import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toastError, undoToast } from "./toast";
import { api } from "./api";
import { nextLabelColor } from "./design";
import { keys } from "./queries";
import type { Comment, Label, ProjectPerson, Recovery, SavedView, Task, TaskStatus } from "./types";

/**
 * Task-level mutations for the detail panel and list. Each one writes the
 * server's response into the caches it affects, so nothing refetches whole
 * lists; edits are applied optimistically first where the result is certain.
 */

const isOpen = (s: TaskStatus) => s !== "DONE" && s !== "CANCELLED";

/** Writes a task (or a patch of it) into the project list and single-task caches. */
export const writeTask = (
  qc: QueryClient,
  projectId: string,
  id: string,
  update: (task: Task) => Task,
) => {
  qc.setQueryData<Task[]>(keys.projectTasks(projectId), (tasks) =>
    tasks?.map((t) => (t.id === id ? update(t) : t)),
  );
  qc.setQueryData<Task>(keys.task(id), (task) => (task ? update(task) : task));
  // My work lists tasks from many projects; keep its copy in step too.
  qc.setQueriesData<Task[]>({ queryKey: keys.allMyTasks }, (tasks) =>
    tasks?.map((t) => (t.id === id ? update(t) : t)),
  );
};

export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate">
>;

export const useUpdateTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api<Task>(`/tasks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.projectTasks(projectId) });
      const previous = qc.getQueryData<Task[]>(keys.projectTasks(projectId));
      const before = previous?.find((t) => t.id === id) ?? qc.getQueryData<Task>(keys.task(id));
      // Cards show the assignee's avatar, so resolve the person right away.
      const assignee =
        patch.assigneeId === undefined
          ? undefined
          : patch.assigneeId === null
            ? null
            : (qc
                .getQueryData<ProjectPerson[]>(keys.projectMembers(projectId))
                ?.find((p) => p.userId === patch.assigneeId)?.user ?? undefined);
      writeTask(qc, projectId, id, (t) => ({
        ...t,
        ...patch,
        ...(assignee !== undefined ? { assignee } : {}),
      }));
      return { previous, before };
    },
    onError: (error, { id }, context) => {
      if (context?.previous) qc.setQueryData(keys.projectTasks(projectId), context.previous);
      if (context?.before) qc.setQueryData(keys.task(id), context.before);
      void qc.invalidateQueries({ queryKey: keys.allMyTasks });
      toastError(error);
    },
    onSuccess: (task, { patch }, context) => {
      writeTask(qc, projectId, task.id, () => task);
      void qc.invalidateQueries({ queryKey: keys.taskActivity(task.id) });
      const was = context?.before?.status;
      if (patch.status && was && isOpen(was) !== isOpen(patch.status))
        void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
    },
  });
};

export const useTaskLabel = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, label, on }: { taskId: string; label: Label; on: boolean }) =>
      on
        ? api<Task>(`/tasks/${taskId}/labels`, { method: "POST", body: { labelId: label.id } })
        : api<Task>(`/tasks/${taskId}/labels/${label.id}`, { method: "DELETE" }),
    onMutate: ({ taskId, label, on }) =>
      writeTask(qc, projectId, taskId, (t) => ({
        ...t,
        labels: on ? [...t.labels, label] : t.labels.filter((l) => l.id !== label.id),
      })),
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) });
      toastError(error);
    },
    onSuccess: (task) => {
      writeTask(qc, projectId, task.id, () => task);
      void qc.invalidateQueries({ queryKey: keys.taskActivity(task.id) });
    },
  });
};

/** Creates a project label in the next unused palette color. */
export const useCreateLabel = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) => {
      const next = color ?? nextLabelColor(qc.getQueryData<Label[]>(keys.projectLabels(projectId)) ?? []);
      return api<Label>(`/projects/${projectId}/labels`, { method: "POST", body: { name, color: next } });
    },
    onSuccess: (label) =>
      qc.setQueryData<Label[]>(keys.projectLabels(projectId), (labels) =>
        labels ? [...labels, label].sort((a, b) => a.name.localeCompare(b.name)) : labels,
      ),
  });
};

/** Deletes a task (and its subtasks) with Undo. */
export const useDeleteTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  const restore = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) }),
      qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
      qc.invalidateQueries({ queryKey: keys.allMyTasks }),
    ]);
  return useMutation({
    mutationFn: (task: Task) => api<Recovery>(`/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: (recovery, task) => {
      qc.setQueryData<Task[]>(keys.projectTasks(projectId), (tasks) =>
        tasks?.filter((t) => t.id !== task.id && t.parentTaskId !== task.id),
      );
      qc.setQueriesData<Task[]>({ queryKey: keys.allMyTasks }, (tasks) =>
        tasks?.filter((t) => t.id !== task.id && t.parentTaskId !== task.id),
      );
      void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
      undoToast(`Deleted ${task.key}`, recovery, restore);
    },
    onError: (error) => toastError(error),
  });
};

export const useDuplicateTask = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api<Task>(`/tasks/${taskId}/duplicate`, { method: "POST" }),
    // Duplicating also copies subtasks, so the list is reloaded once.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) }),
        qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
      ]),
    onError: (error) => toastError(error),
  });
};

const bumpComments = (qc: QueryClient, projectId: string, taskId: string, by: number) =>
  writeTask(qc, projectId, taskId, (t) => ({
    ...t,
    _count: { ...t._count, comments: Math.max(0, t._count.comments + by) },
  }));

export const useCreateComment = (projectId: string, taskId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<Comment>(`/tasks/${taskId}/comments`, { method: "POST", body: { body } }),
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(keys.taskComments(taskId), (list) => (list ? [...list, comment] : list));
      bumpComments(qc, projectId, taskId, 1);
    },
    onError: (error) => toastError(error),
  });
};

export const useEditComment = (taskId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api<Comment>(`/comments/${id}`, { method: "PATCH", body: { body } }),
    onSuccess: (comment) =>
      qc.setQueryData<Comment[]>(keys.taskComments(taskId), (list) =>
        list?.map((c) => (c.id === comment.id ? { ...c, ...comment } : c)),
      ),
    onError: (error) => toastError(error),
  });
};

export const useDeleteComment = (projectId: string, taskId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.setQueryData<Comment[]>(keys.taskComments(taskId), (list) => list?.filter((c) => c.id !== id));
      bumpComments(qc, projectId, taskId, -1);
    },
    onError: (error) => toastError(error),
  });
};

/** Personal saved views (V05–V07): only the signed-in user's own. */
export const useSaveView = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; filters: SavedView["filters"] }) =>
      api<SavedView>(`/projects/${projectId}/views`, { method: "POST", body: input }),
    onSuccess: (view) =>
      qc.setQueryData<SavedView[]>(keys.projectViews(projectId), (views) => (views ? [...views, view] : views)),
    onError: (error) => toastError(error),
  });
};

export const useDeleteView = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/projects/${projectId}/views/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) =>
      qc.setQueryData<SavedView[]>(keys.projectViews(projectId), (views) => views?.filter((v) => v.id !== id)),
    onError: (error) => toastError(error),
  });
};
