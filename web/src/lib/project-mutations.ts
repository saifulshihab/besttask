import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastError, undoToast } from "./toast";
import { api } from "./api";
import { keys } from "./queries";
import type { CardFields, Label, Priority, ProjectDetail, ProjectListItem, Recovery, Role, Task, TaskStatus } from "./types";

export type ProjectPatch = Partial<{
  name: string;
  key: string;
  description: string | null;
  color: string;
  seats: number;
  defaultStatus: TaskStatus;
  defaultPriority: Priority;
  showCancelled: boolean;
  wipLimit: number;
  cardFields: CardFields;
}>;

/** Project settings save as they change; the header and board update at once. */
export const useUpdateProject = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProjectPatch) =>
      api<ProjectDetail>(`/projects/${projectId}`, { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: keys.project(projectId), exact: true }),
        qc.cancelQueries({ queryKey: keys.projects(workspaceId), exact: true }),
      ]);
      const previous = qc.getQueryData<ProjectDetail>(keys.project(projectId));
      const previousList = qc.getQueryData<ProjectListItem[]>(keys.projects(workspaceId));
      qc.setQueryData<ProjectDetail>(keys.project(projectId), (p) => (p ? { ...p, ...patch } : p));
      // The sidebar and workspace settings (seats) read the list; patch it too.
      qc.setQueryData<ProjectListItem[]>(keys.projects(workspaceId), (list) =>
        list?.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
      );
      return { previous, previousList };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) qc.setQueryData(keys.project(projectId), context.previous);
      if (context?.previousList) qc.setQueryData(keys.projects(workspaceId), context.previousList);
      toastError(error);
    },
    onSuccess: (project, patch) => {
      // The response omits the caller's role and seat usage; keep them.
      qc.setQueryData<ProjectDetail>(keys.project(projectId), (p) => (p ? { ...p, ...project, role: p.role, seatsUsed: p.seatsUsed } : p));
      // Sidebar shows name, key and color.
      if (patch.name || patch.key || patch.color)
        void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
      // Task keys are derived from the project key.
      if (patch.key) void qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) });
    },
  });
};

export const useArchiveProject = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/projects/${projectId}/archive`, { method: "POST" }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
        qc.invalidateQueries({ queryKey: keys.project(projectId), exact: true }),
      ]),
    onError: (error) => toastError(error),
  });
};

export const useDeleteProject = (workspaceId: string, projectId: string) => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
  return useMutation({
    mutationFn: () => api<Recovery>(`/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: (recovery) => {
      void refresh();
      const name = qc.getQueryData<ProjectDetail>(keys.project(projectId))?.name ?? "project";
      undoToast(`Deleted ${name}`, recovery, refresh);
    },
    onError: (error) => toastError(error),
  });
};

/** Add, re-role or remove a project member (role null removes). */
export const useSetProjectMember = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role, isNew }: { userId: string; role: Exclude<Role, "WORKSPACE_OWNER"> | null; isNew?: boolean }) =>
      role === null
        ? api(`/projects/${projectId}/members/${userId}`, { method: "DELETE" })
        : isNew
          ? api(`/projects/${projectId}/members`, { method: "POST", body: { userId, role } })
          : api(`/projects/${projectId}/members/${userId}`, { method: "PATCH", body: { role } }),
    onSuccess: (_, { role }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.projectMembers(projectId) }),
        qc.invalidateQueries({ queryKey: keys.projectCandidates(projectId) }),
        // Seat usage lives on the project.
        qc.invalidateQueries({ queryKey: keys.project(projectId), exact: true }),
        // Removing someone clears their task assignments.
        role === null ? qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) }) : undefined,
      ]),
    onError: (error) => toastError(error),
  });
};

/** Renames or recolors a label; chips on the board and list update at once. */
export const useUpdateLabel = (projectId: string) => {
  const qc = useQueryClient();
  const apply = (id: string, patch: Partial<Pick<Label, "name" | "color">>) => {
    qc.setQueryData<Label[]>(keys.projectLabels(projectId), (labels) =>
      labels?.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
    qc.setQueryData<Task[]>(keys.projectTasks(projectId), (tasks) =>
      tasks?.map((t) =>
        t.labels.some((l) => l.id === id)
          ? { ...t, labels: t.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
          : t,
      ),
    );
  };
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; color?: string }) =>
      api<Label>(`/labels/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, ...patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: keys.projectLabels(projectId) }),
        qc.cancelQueries({ queryKey: keys.projectTasks(projectId) }),
      ]);
      const previous = qc.getQueryData<Label[]>(keys.projectLabels(projectId))?.find((l) => l.id === id);
      apply(id, patch);
      return { previous };
    },
    onError: (error, { id }, context) => {
      if (context?.previous) apply(id, { name: context.previous.name, color: context.previous.color });
      toastError(error);
    },
  });
};

export const useDeleteLabel = (projectId: string) => {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.projectLabels(projectId) }),
      qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) }),
    ]);
  return useMutation({
    mutationFn: (label: Label) => api<Recovery>(`/labels/${label.id}`, { method: "DELETE" }),
    onSuccess: (recovery, label) => {
      qc.setQueryData<Label[]>(keys.projectLabels(projectId), (labels) => labels?.filter((l) => l.id !== label.id));
      void qc.invalidateQueries({ queryKey: keys.projectTasks(projectId) });
      undoToast(`Deleted label ${label.name}`, recovery, refresh);
    },
    onError: (error) => toastError(error),
  });
};
