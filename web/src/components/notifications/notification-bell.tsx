import { Popover } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useMarkAllRead } from "@/lib/notification-mutations";
import { DueBanner, NotificationList, useNotificationSummary } from "./notification-list";

/** "9+" past nine, so the badge stays one small circle. */
export const badgeText = (n: number) => (n > 9 ? "9+" : String(n));

/** All / Unread switch and Mark all read, shared by the popover and the page. */
export function NotificationTools({
  workspaceId,
  unreadOnly,
  onUnreadOnly,
}: {
  workspaceId: string;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
}) {
  const { data } = useNotificationSummary(workspaceId);
  const markAll = useMarkAllRead(workspaceId);
  const tab = (value: boolean, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={unreadOnly === value}
      onClick={() => onUnreadOnly(value)}
      className={cn(
        "h-7 rounded-md px-2.5 text-xs font-medium",
        unreadOnly === value ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-hover",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      <div role="tablist" aria-label="Show" className="flex gap-1">
        {tab(false, "All")}
        {tab(true, `Unread${data?.unread ? ` · ${data.unread}` : ""}`)}
      </div>
      <span className="flex-1" />
      <button
        type="button"
        disabled={!data?.unread || markAll.isPending}
        onClick={() => markAll.mutate()}
        className="h-7 rounded-md px-2 text-xs font-medium text-accent-hover hover:bg-hover disabled:text-faint disabled:hover:bg-transparent"
      >
        Mark all read
      </button>
    </div>
  );
}

/** The sidebar's bell: unread badge, and the latest notifications in a popover. */
export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const { data } = useNotificationSummary(workspaceId);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unread = data?.unread ?? 0;
  const close = () => setOpen(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-2 hover:bg-hover data-[popup-open]:border-accent-line data-[popup-open]:bg-accent-tint"
      >
        <Bell size={16} aria-hidden />
        {unread ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-bold text-white ring-2 ring-sidebar"
          >
            {badgeText(unread)}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="right" align="start" sideOffset={10} collisionPadding={8} className="z-40">
          <Popover.Popup className="flex max-h-[min(640px,calc(100svh-24px))] w-[400px] flex-col rounded-xl border border-line bg-raised shadow-popover outline-none">
            <div className="flex flex-col gap-2 border-b border-line-soft p-3 pb-2">
              <Popover.Title className="m-0 text-base font-semibold">Notifications</Popover.Title>
              <NotificationTools workspaceId={workspaceId} unreadOnly={unreadOnly} onUnreadOnly={setUnreadOnly} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
              <DueBanner workspaceId={workspaceId} onNavigate={close} />
              <NotificationList workspaceId={workspaceId} unreadOnly={unreadOnly} onNavigate={close} />
            </div>
            <Link
              to="/w/$workspaceId/notifications"
              params={{ workspaceId }}
              onClick={close}
              className="border-t border-line-soft px-3 py-2.5 text-center text-xs font-medium text-accent-hover no-underline hover:bg-hover"
            >
              Open all notifications
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
