import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NotificationTools } from "@/components/notifications/notification-bell";
import { DueBanner, NotificationList } from "@/components/notifications/notification-list";
import { Page, PageHeader } from "@/components/page";
import { notificationsQuery, notificationSummaryQuery } from "@/lib/queries";

const searchSchema = z.object({
  unread: z.boolean().optional().catch(undefined),
});

/** Every notification, a page at a time; the phone layout's way in. */
export const Route = createFileRoute("/_app/w/$workspaceId/notifications")({
  validateSearch: searchSchema,
  loader: ({ context: { queryClient }, params: { workspaceId } }) => {
    void queryClient.prefetchQuery(notificationSummaryQuery(workspaceId));
    void queryClient.prefetchInfiniteQuery(notificationsQuery(workspaceId));
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const unreadOnly = !!search.unread;
  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Assignments, comments and status changes on your tasks."
      />
      <NotificationTools
        workspaceId={workspaceId}
        unreadOnly={unreadOnly}
        onUnreadOnly={(value) => void navigate({ search: { unread: value || undefined }, replace: true })}
      />
      <DueBanner workspaceId={workspaceId} />
      <div className="rounded-xl border border-line p-1.5">
        <NotificationList workspaceId={workspaceId} unreadOnly={unreadOnly} />
      </div>
    </Page>
  );
}
