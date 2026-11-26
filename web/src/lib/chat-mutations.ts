import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";
import { toastError, undoToast } from "./toast";
import type { Channel, Recovery } from "./types";

/** Lowercase words joined by single dashes, as the API stores channel names. */
export const channelSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

const sortChannels = (list: Channel[]) =>
  [...list].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt),
  );

/** H02: project Admins and the owner. */
export const useCreateChannel = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Channel>(`/projects/${projectId}/channels`, { method: "POST", body: { name } }),
    onSuccess: (channel) =>
      qc.setQueryData<Channel[]>(keys.projectChannels(projectId), (list) =>
        list ? sortChannels([...list.filter((c) => c.id !== channel.id), channel]) : list,
      ),
  });
};

/** H03. The new name shows once the API accepts it (it can clash). */
export const useRenameChannel = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<Channel>(`/channels/${id}`, { method: "PATCH", body: { name } }),
    onSuccess: (channel) =>
      qc.setQueryData<Channel[]>(keys.projectChannels(projectId), (list) =>
        list?.map((c) => (c.id === channel.id ? channel : c)),
      ),
  });
};

/** H04, with the six-second Undo. */
export const useDeleteChannel = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel: Channel) => api<Recovery>(`/channels/${channel.id}`, { method: "DELETE" }),
    onSuccess: (recovery, channel) => {
      qc.setQueryData<Channel[]>(keys.projectChannels(projectId), (list) =>
        list?.filter((c) => c.id !== channel.id),
      );
      undoToast(`Deleted #${channel.name}`, recovery, () =>
        qc.invalidateQueries({ queryKey: keys.projectChannels(projectId) }),
      );
    },
    onError: (error) => toastError(error),
  });
};
