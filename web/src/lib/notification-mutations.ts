import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { keys } from "./queries";
import { toastError } from "./toast";
import type { AppNotification, NotificationSummary, Paginated } from "./types";

type Pages = InfiniteData<Paginated<AppNotification>>;

/** Applies a change to every cached notification in both lists (all and unread). */
const writeNotifications = (
  qc: QueryClient,
  workspaceId: string,
  update: (n: AppNotification) => AppNotification,
) =>
  qc.setQueriesData<Pages>(
    { queryKey: keys.allNotifications(workspaceId), predicate: (q) => typeof q.queryKey[3] === "object" },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({ ...page, data: page.data.map(update) })),
      },
  );

const bumpUnread = (qc: QueryClient, workspaceId: string, by: number | "clear") =>
  qc.setQueriesData<NotificationSummary>({ queryKey: keys.allNotificationSummaries(workspaceId) }, (s) =>
    s && { ...s, unread: by === "clear" ? 0 : Math.max(0, s.unread + by) },
  );

/** Marks one notification read or unread; the bell's count follows at once. */
export const useMarkNotification = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      api<AppNotification>(`/notifications/${id}`, { method: "PATCH", body: { read } }),
    onMutate: ({ id, read }) => {
      const readAt = read ? new Date().toISOString() : null;
      writeNotifications(qc, workspaceId, (n) => (n.id === id ? { ...n, readAt } : n));
      bumpUnread(qc, workspaceId, read ? -1 : 1);
    },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: keys.allNotifications(workspaceId) });
      toastError(error);
    },
    // The unread-only list keeps a just-read row until it is reopened, so
    // the row does not jump away from under the pointer.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.allNotificationSummaries(workspaceId) }),
  });
};

export const useMarkAllRead = (workspaceId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ updated: number }>(`/workspaces/${workspaceId}/notifications/read-all`, { method: "POST" }),
    onMutate: () => {
      const readAt = new Date().toISOString();
      writeNotifications(qc, workspaceId, (n) => (n.readAt ? n : { ...n, readAt }));
      bumpUnread(qc, workspaceId, "clear");
    },
    onError: (error) => toastError(error),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.allNotifications(workspaceId) }),
  });
};
