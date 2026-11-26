import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { RouteError } from "@/components/route-error";
import { ChatProvider } from "@/lib/chat";
import { rememberWorkspace } from "@/lib/last-visited";
import { projectsQuery, workspaceQuery, workspacesQuery } from "@/lib/queries";
import { SelectedProjectProvider } from "@/lib/selected-project";

export const Route = createFileRoute("/_app/w/$workspaceId")({
  loader: async ({ context: { queryClient }, params: { workspaceId } }) => {
    // All shell data loads in parallel; the sidebar renders from cache after.
    await Promise.all([
      queryClient.ensureQueryData(workspaceQuery(workspaceId)),
      queryClient.ensureQueryData(projectsQuery(workspaceId)),
      queryClient.ensureQueryData(workspacesQuery),
    ]);
    rememberWorkspace(workspaceId);
  },
  component: WorkspaceLayout,
  errorComponent: (props) => (
    <div className="flex min-h-svh">
      <RouteError {...props} scope="workspace" />
    </div>
  ),
});

function WorkspaceLayout() {
  const { workspaceId } = Route.useParams();
  return (
    <SelectedProjectProvider workspaceId={workspaceId}>
      {/* One live chat connection per workspace; a new workspace starts afresh. */}
      <ChatProvider key={workspaceId} workspaceId={workspaceId}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ChatProvider>
    </SelectedProjectProvider>
  );
}
