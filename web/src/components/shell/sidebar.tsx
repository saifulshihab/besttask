import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  CircleUserRound,
  Activity,
  ChevronsUpDown,
  Ellipsis,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast, toastError } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import {
  MenuItem,
  MenuLabel,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/lib/design";
import { signOut, useRestoreProject } from "@/lib/mutations";
import {
  meQuery,
  projectsQuery,
  workspaceQuery,
  workspacesQuery,
} from "@/lib/queries";
import type { Role } from "@/lib/types";
import { PROJECT_TABS, type ProjectTab } from "./project-tabs";

const navItem =
  "flex h-[34px] items-center gap-2.5 rounded-[7px] px-2.5 text-left text-base no-underline transition-colors";
const navOn = "bg-accent-soft font-semibold text-ink hover:bg-accent-soft hover:text-ink";
const navOff = "font-normal text-ink-2 hover:bg-hover hover:text-ink-2";

/** The project tab the user is on, so switching projects keeps the same view. */
const useCurrentTab = (): ProjectTab => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const last = pathname.split("/").at(-1) as ProjectTab;
  return pathname.includes("/p/") && PROJECT_TABS.includes(last) ? last : "board";
};

export function Sidebar({
  onCreateWorkspace,
  onCreateProject,
  onOpenSearch,
}: {
  onCreateWorkspace: () => void;
  onCreateProject: () => void;
  onOpenSearch: () => void;
}) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const projectId = useParams({ strict: false }).projectId;
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const isOwner = workspace.role === "WORKSPACE_OWNER";
  const tab = useCurrentTab();
  const restore = useRestoreProject(workspaceId);
  const navigate = useNavigate();

  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);
  const currentRole: Role =
    workspace.role === "WORKSPACE_OWNER"
      ? "WORKSPACE_OWNER"
      : (projects.find((p) => p.id === projectId)?.role ?? "MEMBER");

  const restoreProject = (id: string, name: string) =>
    restore.mutate(id, {
      onSuccess: () => {
        toast(`Restored ${name}`);
        void navigate({
          to: "/w/$workspaceId/p/$projectId/board",
          params: { workspaceId, projectId: id },
        });
      },
      onError: (error) => toastError(error),
    });

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 box-border flex h-svh w-[248px] shrink-0 flex-col gap-4 self-start border-r border-line bg-sidebar px-3 py-3.5"
    >
      <WorkspaceMenu onCreateWorkspace={onCreateWorkspace} />

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-9 items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-sm text-muted"
      >
        <Search size={15} aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
      </button>

      {/* Projects and Workspace scroll here when they outgrow the window; the
          switcher, search and account menu stay put. */}
      <div className="-mx-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between pr-1 pb-1 pl-2.5">
            <span className="text-xs font-semibold text-muted">Projects</span>
            {isOwner ? (
              <button
                type="button"
                aria-label="New project"
                onClick={onCreateProject}
                className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-hover"
              >
                <Plus size={15} aria-hidden />
              </button>
            ) : null}
          </div>

          {active.map((project) => (
            <Link
              key={project.id}
              to={`/w/$workspaceId/p/$projectId/${tab}`}
              params={{ workspaceId, projectId: project.id }}
              className={cn(navItem, project.id === projectId ? navOn : navOff)}
              aria-current={project.id === projectId ? "page" : undefined}
            >
              <span
                className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                style={{ background: project.color }}
              >
                {project.key.slice(0, 2)}
              </span>
              <span className="flex-1 truncate">{project.name}</span>
              <span className="text-xs font-medium text-muted">
                {project._count.tasks}
              </span>
            </Link>
          ))}

          {active.length === 0 && isOwner ? (
            <button
              type="button"
              onClick={onCreateProject}
              className="h-[34px] rounded-[7px] border border-dashed border-line-strong bg-transparent px-2.5 text-left text-sm text-muted hover:bg-hover"
            >
              + Create your first project
            </button>
          ) : null}

          {archived.length > 0 ? (
            <>
              <span className="px-2.5 pt-2 pb-0.5 text-xs text-muted">Archived</span>
              {archived.map((project) => (
                <div
                  key={project.id}
                  className="flex h-8 items-center gap-2 pr-1 pl-2.5 text-sm text-muted"
                >
                  <span className="flex-1 truncate">{project.name}</span>
                  {isOwner ? (
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restoreProject(project.id, project.name)}
                      className="h-7 rounded-sm px-2 text-xs font-medium text-accent-hover hover:bg-hover"
                    >
                      Restore
                    </button>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="px-2.5 pb-1 text-xs font-semibold text-muted">Workspace</span>
          <WorkspaceLink to="/w/$workspaceId/my-work" icon={<CircleUserRound size={16} aria-hidden />}>
            My work
          </WorkspaceLink>
          <WorkspaceLink to="/w/$workspaceId/activity" icon={<Activity size={16} aria-hidden />}>
            Activity
          </WorkspaceLink>
          {/* The workspace directory and settings are owner-only (U01, W03). */}
          {isOwner ? (
            <WorkspaceLink to="/w/$workspaceId/members" icon={<Users size={16} aria-hidden />}>
              Members
            </WorkspaceLink>
          ) : null}
          {isOwner ? (
            <WorkspaceLink
              to="/w/$workspaceId/settings"
              icon={<SlidersHorizontal size={16} aria-hidden />}
            >
              Settings
            </WorkspaceLink>
          ) : null}
        </div>
      </div>

      <AccountMenu roleLabel={ROLE_LABELS[currentRole]} />
    </nav>
  );
}

function WorkspaceLink({
  to,
  icon,
  children,
}: {
  to: "/w/$workspaceId/my-work" | "/w/$workspaceId/activity" | "/w/$workspaceId/members" | "/w/$workspaceId/settings";
  icon: ReactNode;
  children: ReactNode;
}) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  return (
    <Link
      to={to}
      params={{ workspaceId }}
      className={cn(
        navItem,
        navOff,
        "data-[status=active]:bg-accent-soft data-[status=active]:font-semibold data-[status=active]:text-ink",
      )}
      activeProps={{ "aria-current": "page" }}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </Link>
  );
}

function WorkspaceMenu({ onCreateWorkspace }: { onCreateWorkspace: () => void }) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: workspaces } = useSuspenseQuery(workspacesQuery);
  const navigate = useNavigate();
  const roleText = workspace.role === "WORKSPACE_OWNER" ? "Owner" : "Member";

  return (
    <MenuRoot>
      <MenuTrigger
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-hover data-[popup-open]:bg-hover"
      >
        {/* The name read out starts with the action, then the visible text. */}
        <span className="sr-only">Switch workspace: </span>
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-accent text-sm font-bold text-white">
          {workspace.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-semibold text-ink">{workspace.name}</span>
          <span className="text-xs text-muted">
            {roleText} · {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
          </span>
        </span>
        <ChevronsUpDown size={16} className="text-muted" aria-hidden />
      </MenuTrigger>
      <MenuPopup matchTrigger>
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            onClick={() => void navigate({ to: "/w/$workspaceId", params: { workspaceId: w.id } })}
          >
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === workspaceId ? (
              <span className="text-xs text-muted">current</span>
            ) : null}
          </MenuItem>
        ))}
        {/* Any user can create a workspace and becomes its owner. */}
        <MenuSeparator />
        <MenuItem onClick={onCreateWorkspace}>+ Create workspace</MenuItem>
      </MenuPopup>
    </MenuRoot>
  );
}

function AccountMenu({ roleLabel }: { roleLabel: string }) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const { data: me } = useSuspenseQuery(meQuery);
  const navigate = useNavigate();
  return (
    <MenuRoot>
      <MenuTrigger
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-hover data-[popup-open]:bg-hover"
      >
        <span className="sr-only">Account menu: </span>
        <Avatar user={me} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-ink">{me.name}</span>
          <span className="text-2xs text-muted">{roleLabel}</span>
        </span>
        <Ellipsis size={16} className="text-muted" aria-hidden />
      </MenuTrigger>
      <MenuPopup side="top" matchTrigger>
        <MenuLabel>Signed in as {me.name}</MenuLabel>
        <MenuItem
          onClick={() => void navigate({ to: "/w/$workspaceId/profile", params: { workspaceId } })}
        >
          Profile
        </MenuItem>
        <MenuItem
          onClick={() => void navigate({ to: "/w/$workspaceId/account", params: { workspaceId } })}
        >
          Account settings
        </MenuItem>
        {/* The session listener in main.tsx redirects to /login once tokens clear. */}
        <MenuItem tone="danger" onClick={() => void signOut()}>
          Sign out
        </MenuItem>
      </MenuPopup>
    </MenuRoot>
  );
}
