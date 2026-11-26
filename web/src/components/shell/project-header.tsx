import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { projectMembersQuery, projectQuery, workspaceQuery } from "@/lib/queries";
import { isViewTab, PROJECT_TABS, type ProjectTab } from "./project-tabs";
import { QuickAddDialog } from "./quick-add-dialog";

const MAX_AVATARS = 4;

/** Titles of the project pages that are not task views. */
const PAGE_TITLES: Partial<Record<ProjectTab, string>> = {
  "my-work": "My work",
  activity: "Activity",
  members: "Members",
  settings: "Settings",
};

// Router links set data-status="active"; styling on it avoids class-order
// conflicts between the base and active classes.
const tabClass =
  "border-0 border-b-2 border-transparent bg-transparent px-0 pt-2 pb-2.5 text-sm font-medium text-muted no-underline hover:text-ink data-[status=active]:border-accent data-[status=active]:font-semibold data-[status=active]:text-ink";

export function ProjectHeader() {
  const { workspaceId, projectId } = useParams({
    from: "/_app/w/$workspaceId/p/$projectId",
  });
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  // Avatars are secondary; the header renders without waiting for them.
  const { data: people = [] } = useQuery(projectMembersQuery(projectId));
  const [quickAdd, setQuickAdd] = useState(false);
  const current = useRouterState({
    select: (s) => s.location.pathname.split("/").at(-1) as ProjectTab,
  });
  // Board, List and Calendar are tabs here; the other pages are in the sidebar.
  const onView = !PROJECT_TABS.includes(current) || isViewTab(current);

  const editable = !project.archivedAt;
  const shown = people.filter((p) => p.active).slice(0, MAX_AVATARS);
  const extra = people.filter((p) => p.active).length - shown.length;

  const tab = (to: ProjectTab, label: string) => (
    <Link
      role="tab"
      to={`/w/$workspaceId/p/$projectId/${to}`}
      params={{ workspaceId, projectId }}
      className={tabClass}
      activeProps={{ "aria-selected": true }}
      inactiveProps={{ "aria-selected": false }}
    >
      {label}
    </Link>
  );

  return (
    <header className={cn("flex flex-col gap-3.5 border-b border-line px-7 pt-[18px]", !onView && "pb-4.5")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted">
            {workspace.name} / {onView ? "Projects" : project.name}
          </span>
          <h1 className="m-0 text-2xl font-bold tracking-[-0.01em]">
            {onView ? project.name : PAGE_TITLES[current]}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center -space-x-1.5">
            {shown.map((person) => (
              <Avatar
                key={person.userId}
                user={person.user}
                className="ring-2 ring-canvas"
                tooltip
              />
            ))}
            {extra > 0 ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-menu-hover text-2xs font-semibold text-ink-2 ring-2 ring-canvas">
                +{extra}
              </span>
            ) : null}
          </div>
          <Tooltip content="Restore the project to add tasks" disabled={editable} wrap>
            <Button variant="primary" onClick={() => setQuickAdd(true)} disabled={!editable}>
              <Plus size={15} strokeWidth={2.4} aria-hidden />
              New task
            </Button>
          </Tooltip>
        </div>
      </div>
      {onView ? (
        <div role="tablist" aria-label="Project views" className="flex gap-5">
          {tab("board", "Board")}
          {tab("list", "List")}
          {tab("calendar", "Calendar")}
        </div>
      ) : null}
      <QuickAddDialog open={quickAdd} onOpenChange={setQuickAdd} project={project} people={people} />
    </header>
  );
}
