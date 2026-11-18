import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { ACTIVITY_TYPES, ActivityFeed, type ActivityType } from "@/components/activity/activity-feed";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { activityQuery, projectsQuery, workspaceQuery } from "@/lib/queries";

const searchSchema = z.object({
  project: z.string().optional().catch(undefined),
  type: z.enum(["all", "created", "moved", "edits", "comment", "deleted", "other"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_app/w/$workspaceId/activity")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ project: search.project }),
  loader: async ({ context: { queryClient }, params: { workspaceId }, deps }) => {
    const workspace = await queryClient.ensureQueryData(workspaceQuery(workspaceId));
    // Only the owner can filter by project (A08); others always see all of theirs.
    const projectId = workspace.role === "WORKSPACE_OWNER" ? deps.project : undefined;
    await queryClient.ensureInfiniteQueryData(activityQuery(workspaceId, projectId ? { projectId } : {}));
  },
  component: WorkspaceActivity,
});

function WorkspaceActivity() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const owner = workspace.role === "WORKSPACE_OWNER";
  const projectId = owner ? search.project : undefined;
  const type: ActivityType = owner ? (search.type ?? "all") : "all";
  const projectName = projects.find((p) => p.id === projectId)?.name ?? "All projects";

  return (
    <Page>
        <PageHeader title="Activity" description={`Everything that changed in ${workspace.name}, newest first.`} />
        {owner ? (
          <div className="flex flex-wrap items-center gap-2">
            <MenuRoot>
              <MenuTrigger className="h-[34px] rounded-md border border-line-strong bg-canvas px-2.5 text-sm text-ink hover:bg-hover">
                {projectName}
              </MenuTrigger>
              <MenuPopup className="min-w-[200px]">
                {[{ id: undefined, name: "All projects" }, ...projects].map((p) => (
                  <MenuItem
                    key={p.id ?? "all"}
                    onClick={() => void navigate({ search: (prev) => ({ ...prev, project: p.id }), replace: true })}
                    className={p.id === projectId ? "font-semibold text-accent-hover" : undefined}
                  >
                    {p.name}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuRoot>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              Show
              <Select
                value={type}
                onValueChange={(v) =>
                  void navigate({
                    search: (prev) => ({ ...prev, type: v === "all" ? undefined : v }),
                    replace: true,
                  })
                }
                size="sm"
                className="w-auto min-w-[180px]"
                popupClassName="min-w-[280px]"
                options={ACTIVITY_TYPES.map((t) => ({ value: t.id, label: t.name }))}
              />
            </label>
          </div>
        ) : null}
        <ActivityFeed workspaceId={workspaceId} filters={projectId ? { projectId } : {}} type={type} />
    </Page>
  );
}
