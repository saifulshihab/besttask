import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastError, undoToast } from "./toast";
import { api } from "./api";
import { clearTokens } from "./auth";
import { keys } from "./queries";
import type { Me, Recovery, Role, Workspace } from "./types";

/** Owner-only workspace actions (W04–W07, U03–U06), plus own-account actions (C). */

export const useRenameWorkspace = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Workspace>(`/workspaces/${workspaceId}`, { method: "PATCH", body: { name } }),
    onSuccess: (workspace) => {
      qc.setQueryData<Workspace>(keys.workspace(workspaceId), (w) => (w ? { ...w, ...workspace, role: w.role } : w));
      void qc.invalidateQueries({ queryKey: keys.workspaces, exact: true });
    },
    onError: (error) => toastError(error),
  });
};

export const useDeleteWorkspace = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.workspace(workspaceId) });
      return qc.invalidateQueries({ queryKey: keys.workspaces, exact: true });
    },
    onError: (error) => toastError(error),
  });
};

const useRefreshMembers = (workspaceId: string) => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.workspaceMembers(workspaceId) }),
      // Membership changes clear task assignments and change project teams.
      qc.invalidateQueries({ queryKey: ["project"] }),
    ]);
};

export const useAddWorkspaceMember = (workspaceId: string) => {
  const refresh = useRefreshMembers(workspaceId);
  return useMutation({
    mutationFn: (email: string) =>
      api(`/workspaces/${workspaceId}/members`, { method: "POST", body: { email } }),
    onSuccess: refresh,
  });
};

export const useSetMemberActive = (workspaceId: string) => {
  const refresh = useRefreshMembers(workspaceId);
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      api(`/workspaces/${workspaceId}/members/${userId}`, { method: "PATCH", body: { active } }),
    onSuccess: refresh,
    onError: (error) => toastError(error),
  });
};

export const useRemoveWorkspaceMember = (workspaceId: string) => {
  const refresh = useRefreshMembers(workspaceId);
  return useMutation({
    mutationFn: ({ userId }: { userId: string; name: string }) =>
      api<Recovery>(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (recovery, { name }) => {
      void refresh();
      undoToast(`Removed ${name}`, recovery, refresh);
    },
    onError: (error) => toastError(error),
  });
};

export const useTransferOwnership = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      /** The current owner's project roles after the transfer. */
      assignments: { projectId: string; role: Exclude<Role, "WORKSPACE_OWNER"> }[];
    }) => api(`/workspaces/${workspaceId}/transfer`, { method: "POST", body: input }),
    // Roles change everywhere in this workspace.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.workspace(workspaceId) }),
        qc.invalidateQueries({ queryKey: keys.workspaces, exact: true }),
        qc.invalidateQueries({ queryKey: ["project"] }),
      ]),
  });
};

export type ProfilePatch = Partial<
  Pick<Me, "name" | "email" | "avatar" | "jobTitle" | "bio" | "timezone" | "theme" | "startPage">
>;

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => api<Me>("/auth/me", { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.me });
      const previous = qc.getQueryData<Me>(keys.me);
      qc.setQueryData<Me>(keys.me, (me) => (me ? { ...me, ...patch } : me));
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) qc.setQueryData(keys.me, context.previous);
      toastError(error);
    },
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
};

/** Changes the sign-in email; the API requires the current password. */
export const useChangeEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; currentPassword: string }) =>
      api<Me>("/auth/me", { method: "PATCH", body: input }),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: (input: { currentPassword: string; password: string }) =>
      api("/auth/password", { method: "POST", body: input }),
    // The API revokes every session, this one included.
    onSuccess: () => clearTokens(),
  });

export const useDeleteAccount = () =>
  useMutation({
    mutationFn: (password: string) => api("/auth/me", { method: "DELETE", body: { password } }),
    onSuccess: () => clearTokens(),
  });
