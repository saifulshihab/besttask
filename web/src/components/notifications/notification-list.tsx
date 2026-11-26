import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlarmClock, Bell } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { STATUSES } from "@/lib/design";
import { relativeTime } from "@/lib/format";
import { useMarkNotification } from "@/lib/notification-mutations";
import { notificationsQuery, notificationSummaryQuery } from "@/lib/queries";
import { useSelectedProject } from "@/lib/selected-project";
import type { AppNotification } from "@/lib/types";

/**
 * Unread count for the workspace, and due counts for the selected project
 * (so they match its My work, C15).
 */
export const useNotificationSummary = (workspaceId: string) => {
  const project = useSelectedProject();
  return useQuery(notificationSummaryQuery(workspaceId, project?.id ?? null));
};
import { useIsMobile } from "@/lib/use-mobile";

/** "Lina assigned you WEB-12", with the names and IDs in bold. */
const headline = (n: AppNotification): ReactNode => {
  const who = <strong className="font-semibold">{n.actor ? n.actor.name || n.actor.email : "Someone"}</strong>;
  const key = <strong className="font-semibold">{n.task.key}</strong>;
  if (n.type === "task.assigned") return <>{who} assigned you {key}</>;
  if (n.type === "comment.created") return <>{who} commented on {key}</>;
  const to = n.metadata?.to;
  return (
    <>
      {who} moved {key} to <strong className="font-semibold">{to ? STATUSES[to].name : "a new status"}</strong>
    </>
  );
};

/** Text for screen readers and the mark-read button, without markup. */
const plain = (n: AppNotification) => {
  const who = n.actor ? n.actor.name || n.actor.email : "Someone";
  if (n.type === "task.assigned") return `${who} assigned you ${n.task.key}`;
  if (n.type === "comment.created") return `${who} commented on ${n.task.key}`;
  return `${who} moved ${n.task.key} to ${n.metadata?.to ? STATUSES[n.metadata.to].name : "a new status"}`;
};

/**
 * Overdue and due-today counts in the selected project, linking to its My
 * work. They are worked out when asked, not stored, so they never pile up as
 * notifications.
 */
export function DueBanner({ workspaceId, onNavigate }: { workspaceId: string; onNavigate?: () => void }) {
  const project = useSelectedProject();
  const { data } = useNotificationSummary(workspaceId);
  if (!project || !data || (data.overdue === 0 && data.dueToday === 0)) return null;
  const tasks = (n: number) => `${n} task${n === 1 ? "" : "s"}`;
  // "2 tasks overdue, 1 due today" / "1 task due today"
  const text = [
    data.overdue ? `${tasks(data.overdue)} overdue` : null,
    data.dueToday ? `${data.overdue ? data.dueToday : tasks(data.dueToday)} due today` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      to="/w/$workspaceId/p/$projectId/my-work"
      params={{ workspaceId, projectId: project.id }}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm no-underline",
        data.overdue ? "border-danger-line bg-danger-soft text-danger-ink" : "border-warn-line bg-warn-soft text-warn-ink",
      )}
    >
      <AlarmClock size={16} aria-hidden className="shrink-0" />
      <span className="flex-1">
        {text} in {project.name}
      </span>
      <span className="text-xs font-semibold">My work →</span>
    </Link>
  );
}

export function NotificationList({
  workspaceId,
  unreadOnly = false,
  onNavigate,
}: {
  workspaceId: string;
  unreadOnly?: boolean;
  /** Called after a notification opens its task (the popover closes). */
  onNavigate?: () => void;
}) {
  const list = useInfiniteQuery(notificationsQuery(workspaceId, unreadOnly));
  const mark = useMarkNotification(workspaceId);
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  const open = (n: AppNotification) => {
    if (!n.readAt) mark.mutate({ id: n.id, read: true });
    onNavigate?.();
    // The phone board has its own task sheets; the list opens the panel.
    void navigate({
      to: mobile ? "/w/$workspaceId/p/$projectId/list" : "/w/$workspaceId/p/$projectId/board",
      params: { workspaceId, projectId: n.task.projectId },
      search: { task: n.task.id },
    });
  };

  if (list.isPending) return <p className="m-0 px-1 py-6 text-center text-sm text-muted">Loading…</p>;
  if (list.isError)
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="m-0 text-sm text-muted">Couldn’t load notifications.</p>
        <Button onClick={() => void list.refetch()}>Try again</Button>
      </div>
    );
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Bell size={22} className="text-faint" aria-hidden />
        <p className="m-0 text-sm font-semibold">{unreadOnly ? "You’re all caught up" : "No notifications yet"}</p>
        <p className="m-0 text-xs text-muted">
          You’ll hear here when someone assigns you a task, comments on your tasks, or moves them.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((n) => (
          <li key={n.id} className="group relative">
            <button
              type="button"
              onClick={() => open(n)}
              aria-label={`${plain(n)}${n.readAt ? "" : ", unread"}`}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border-0 bg-transparent py-2.5 pr-9 pl-2 text-left hover:bg-hover",
                !n.readAt && "bg-accent-tint/60",
              )}
            >
              {n.actor ? (
                <Avatar user={n.actor} size="md" />
              ) : (
                <span className="size-7 shrink-0 rounded-full bg-menu-hover" aria-hidden />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-sm leading-snug", n.readAt ? "text-ink-2" : "text-ink")}>{headline(n)}</span>
                <span className="truncate text-xs text-ink-2">
                  {n.type === "comment.created" && n.metadata?.excerpt ? `“${n.metadata.excerpt}”` : n.task.title}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span aria-hidden className="inline-block size-2 rounded-[3px]" style={{ background: n.task.project.color }} />
                  {n.task.project.name} · {relativeTime(n.createdAt)}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label={n.readAt ? `Mark unread: ${plain(n)}` : `Mark read: ${plain(n)}`}
              title={n.readAt ? "Mark unread" : "Mark read"}
              onClick={() => mark.mutate({ id: n.id, read: !n.readAt })}
              className="absolute top-2.5 right-1.5 flex size-7 items-center justify-center rounded-full border-0 bg-transparent hover:bg-menu-hover"
            >
              <span
                aria-hidden
                className={cn(
                  "box-border size-2.5 rounded-full",
                  n.readAt ? "border-[1.5px] border-faint opacity-0 group-hover:opacity-100" : "bg-accent",
                )}
              />
            </button>
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
