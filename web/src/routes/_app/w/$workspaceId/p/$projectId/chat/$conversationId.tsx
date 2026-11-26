import { createFileRoute } from "@tanstack/react-router";
import { Conversation } from "@/components/chat/conversation";

/** One channel (its id) or direct message (`dm-<userId>`) of the project. */
export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/chat/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { workspaceId, projectId, conversationId } = Route.useParams();
  return <Conversation key={conversationId} workspaceId={workspaceId} projectId={projectId} conversationId={conversationId} />;
}
