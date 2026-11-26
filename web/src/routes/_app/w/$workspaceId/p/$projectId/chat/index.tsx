import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { projectChannelsQuery } from "@/lib/queries";
import { useIsMobile } from "@/lib/use-mobile";

/** Chat without a conversation: the first channel (#general), or the list on phones. */
export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/chat/")({
  component: ChatHome,
});

function ChatHome() {
  const { workspaceId, projectId } = Route.useParams();
  const { data: channels } = useSuspenseQuery(projectChannelsQuery(projectId));
  const mobile = useIsMobile();
  const first = channels[0];
  if (mobile) return null;
  if (!first)
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">No channels yet.</div>;
  return (
    <Navigate
      to="/w/$workspaceId/p/$projectId/chat/$conversationId"
      params={{ workspaceId, projectId, conversationId: first.id }}
      replace
    />
  );
}
