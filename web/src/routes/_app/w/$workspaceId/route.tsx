import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { RouteError } from "@/components/route-error";
import { rememberWorkspace } from "@/lib/last-visited";
import { projectsQuery, workspaceQuery, workspacesQuery } from "@/lib/queries";

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
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  errorComponent: (props) => (
    <div className="flex min-h-svh">
      <RouteError {...props} scope="workspace" />
    </div>
  ),
});
