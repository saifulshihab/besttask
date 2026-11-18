import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { MobileProject } from "@/components/mobile/mobile-project";
import { ProjectHeader } from "@/components/shell/project-header";
import { RouteError } from "@/components/route-error";
import { TaskPanel } from "@/components/tasks/task-panel";
import { rememberProject } from "@/lib/last-visited";
import { projectMembersQuery, projectQuery } from "@/lib/queries";
import { useIsMobile } from "@/lib/use-mobile";

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId")({
  loader: async ({ context: { queryClient }, params }) => {
    // Members feed the header avatars; start the request without waiting on it.
    void queryClient.prefetchQuery(projectMembersQuery(params.projectId));
    await queryClient.ensureQueryData(projectQuery(params.projectId));
    rememberProject(params.workspaceId, params.projectId);
  },
  component: ProjectLayout,
  errorComponent: (props) => <RouteError {...props} scope="project" />,
});

function ProjectLayout() {
  const { workspaceId, projectId } = Route.useParams();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  // Board and list both carry `?task=`; the panel opens over either.
  const taskId = useSearch({ strict: false }).task;
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const onBoard = useRouterState({ select: (s) => s.location.pathname.endsWith("/board") });
  // On phones the board is the prototype's mobile app; other tabs stay pages.
  if (mobile && onBoard) return <MobileProject workspaceId={workspaceId} project={project} />;
  return (
    <>
      <ProjectHeader />
      <Outlet />
      {taskId ? (
        <TaskPanel
          workspaceId={workspaceId}
          project={project}
          taskId={taskId}
          onClose={() =>
            void navigate({
              to: ".",
              search: (prev: Record<string, unknown>) => ({ ...prev, task: undefined }),
              replace: true,
            })
          }
        />
      ) : null}
    </>
  );
}
