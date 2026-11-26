import { createFileRoute } from "@tanstack/react-router";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { activityQuery } from "@/lib/queries";

/** Project Activity page: the project's events, for every role (A06). */
export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/activity")({
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    queryClient.ensureInfiniteQueryData(activityQuery(projectId)),
  component: ProjectActivity,
});

function ProjectActivity() {
  const { workspaceId, projectId } = Route.useParams();
  return (
    <div className="flex justify-center">
      <div className="box-border flex w-full max-w-[820px] flex-col gap-[18px] px-7 pt-6 pb-10">
        <ActivityFeed workspaceId={workspaceId} projectId={projectId} />
      </div>
    </div>
  );
}
