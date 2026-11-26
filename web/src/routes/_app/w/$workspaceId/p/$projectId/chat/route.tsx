import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { projectChannelsQuery, projectMembersQuery } from "@/lib/queries";
import { useIsMobile } from "@/lib/use-mobile";

/**
 * The chat screen: a column of the project's channels and direct messages
 * beside the open conversation. On phones it is one or the other: the list
 * at /chat, a conversation full width at /chat/<id>.
 */
export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/chat")({
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    Promise.all([
      queryClient.ensureQueryData(projectChannelsQuery(projectId)),
      queryClient.ensureQueryData(projectMembersQuery(projectId)),
    ]),
  component: ChatLayout,
});

function ChatLayout() {
  const { workspaceId, projectId } = Route.useParams();
  const conversationId = useParams({ strict: false }).conversationId;
  const mobile = useIsMobile();
  return (
    // The window's height (minus the phone's back bar), so the message list
    // scrolls inside it and the composer stays put.
    <div className="flex h-svh min-h-0 max-md:h-[calc(100svh-48px)]">
      {mobile && conversationId ? null : (
        <ChatSidebar
          workspaceId={workspaceId}
          projectId={projectId}
          conversationId={conversationId ?? null}
          className={mobile ? "flex-1" : "w-[264px] shrink-0 border-r border-line"}
        />
      )}
      {mobile && !conversationId ? null : <Outlet />}
    </div>
  );
}
