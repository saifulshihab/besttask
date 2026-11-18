import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { NameDialog } from "@/components/shell/name-dialog";
import { PageMessage } from "@/components/page-message";
import { Button } from "@/components/ui/button";
import { lastProject } from "@/lib/last-visited";
import { useCreateProject } from "@/lib/mutations";
import { meQuery, projectsQuery, workspaceQuery } from "@/lib/queries";

/** Opens the last-used project (else the first) on the user's start page. */
export const Route = createFileRoute("/_app/w/$workspaceId/")({
  loader: async ({ context: { queryClient }, params: { workspaceId } }) => {
    const [projects, me] = await Promise.all([
      queryClient.ensureQueryData(projectsQuery(workspaceId)),
      queryClient.ensureQueryData(meQuery),
    ]);
    const open = projects.filter((p) => !p.archivedAt);
    const remembered = lastProject(workspaceId);
    const target = open.find((p) => p.id === remembered) ?? open[0];
    if (!target) return;
    const params = { workspaceId, projectId: target.id };
    if (me.startPage === "list")
      throw redirect({ to: "/w/$workspaceId/p/$projectId/list", params, replace: true });
    if (me.startPage === "activity")
      throw redirect({ to: "/w/$workspaceId/p/$projectId/activity", params, replace: true });
    throw redirect({ to: "/w/$workspaceId/p/$projectId/board", params, replace: true });
  },
  component: NoProjects,
});

function NoProjects() {
  const { workspaceId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const create = useCreateProject(workspaceId);
  const [open, setOpen] = useState(false);
  const isOwner = workspace.role === "WORKSPACE_OWNER";

  return (
    <>
      <PageMessage
        title={`No projects in ${workspace.name} yet`}
        body={
          isOwner
            ? "Projects hold your board, list and activity. Create one to start adding tasks."
            : "You haven’t been added to a project here yet. The workspace owner can add you."
        }
        action={
          isOwner ? (
            <Button variant="primary" size="xl" onClick={() => setOpen(true)}>
              Create project
            </Button>
          ) : null
        }
      />
      <NameDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) create.reset();
        }}
        title="New project"
        label="Project name"
        placeholder="e.g. Website relaunch"
        submitLabel="Create project"
        pending={create.isPending}
        error={create.error?.message}
        onSubmit={(name) =>
          create.mutate(name, {
            onSuccess: (project) => {
              toast(`Created ${project.name}`);
              void navigate({
                to: "/w/$workspaceId/p/$projectId/board",
                params: { workspaceId, projectId: project.id },
              });
            },
          })
        }
      />
    </>
  );
}
