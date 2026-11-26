import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ChevronsUpDown,
  CircleUserRound,
  Ellipsis,
  LayoutGrid,
  MessageSquare,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  MenuItem,
  MenuLabel,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { unreadIn, useChatState } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ROLE_LABELS } from "@/lib/design";
import { signOut } from "@/lib/mutations";
import {
  meQuery,
  projectsQuery,
  workspaceQuery,
  workspacesQuery,
} from "@/lib/queries";
import { useSelectedProject } from "@/lib/selected-project";
import type { ProjectListItem, Role } from "@/lib/types";
import { isViewTab, tabOf, type ProjectTab } from "./project-tabs";

const navItem =
  "flex h-[34px] items-center gap-2.5 rounded-[7px] px-2.5 text-left text-base no-underline transition-colors";
const navOn = "bg-accent-soft font-semibold text-ink hover:bg-accent-soft hover:text-ink";
const navOff = "font-normal text-ink-2 hover:bg-hover hover:text-ink-2";

/** The project page the user is on, or null on a workspace page. */
const useCurrentTab = (): ProjectTab | null =>
  useRouterState({ select: (s) => tabOf(s.location.pathname) });

/** Unread chat count, as a pill; nothing when zero. */
function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-2xs font-semibold text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/** The owner and the project's admins manage it (S01). */
const canManage = (isOwner: boolean, project: ProjectListItem) =>
  isOwner || project.role !== "MEMBER";

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
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const isOwner = workspace.role === "WORKSPACE_OWNER";
  const project = useSelectedProject();
  const tab = useCurrentTab();
  const currentRole: Role = isOwner ? "WORKSPACE_OWNER" : (project?.role ?? "MEMBER");
  const unread = useChatState((s) => s.unread);

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 box-border flex h-svh w-[248px] shrink-0 flex-col gap-4 self-start border-r border-line bg-sidebar px-3 py-3.5"
    >
      <WorkspaceMenu onCreateWorkspace={onCreateWorkspace} />

      <div className="flex gap-2">
        {/* Search covers the selected project only (V01, V02). */}
        <button
          type="button"
          onClick={onOpenSearch}
          disabled={!project}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-sm text-muted disabled:opacity-60"
        >
          <Search size={15} aria-hidden />
          <span className="flex-1 truncate text-left">Search or jump to…</span>
        </button>
        <NotificationBell workspaceId={workspaceId} />
      </div>

      {/* The project and workspace links scroll when they outgrow the window;
          the switchers, search and account menu stay put. */}
      <div className="-mx-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3">
        <div className="flex flex-col gap-0.5">
          <ProjectMenu onCreateProject={onCreateProject} />
          {project ? (
            <div className="mt-1 flex flex-col gap-0.5">
              {/* Board, List and Calendar are tabs inside Tasks. */}
              <ProjectLink
                project={project}
                to="board"
                on={tab !== null && isViewTab(tab)}
                icon={<LayoutGrid size={16} aria-hidden />}
              >
                Tasks
              </ProjectLink>
              <ProjectLink
                project={project}
                to="my-work"
                on={tab === "my-work"}
                icon={<CircleUserRound size={16} aria-hidden />}
              >
                My work
              </ProjectLink>
              <ProjectLink
                project={project}
                to="chat"
                on={tab === "chat"}
                icon={<MessageSquare size={16} aria-hidden />}
                badge={<UnreadBadge count={unreadIn(unread, project.id)} />}
              >
                Chat
              </ProjectLink>
              <ProjectLink
                project={project}
                to="activity"
                on={tab === "activity"}
                icon={<Activity size={16} aria-hidden />}
              >
                Activity
              </ProjectLink>
              <ProjectLink
                project={project}
                to="members"
                on={tab === "members"}
                icon={<Users size={16} aria-hidden />}
              >
                Members
              </ProjectLink>
              {canManage(isOwner, project) ? (
                <ProjectLink
                  project={project}
                  to="settings"
                  on={tab === "settings"}
                  icon={<Settings size={16} aria-hidden />}
                >
                  Settings
                </ProjectLink>
              ) : null}
            </div>
          ) : isOwner ? (
            <button
              type="button"
              onClick={onCreateProject}
              className="mt-1 h-[34px] rounded-[7px] border border-dashed border-line-strong bg-transparent px-2.5 text-left text-sm text-muted hover:bg-hover"
            >
              + Create your first project
            </button>
          ) : null}
        </div>

        {/* The workspace directory and settings are owner-only (U01, W03). */}
        {isOwner ? (
          <div className="flex flex-col gap-0.5">
            <span className="px-2.5 pb-1 text-xs font-semibold text-muted">Workspace</span>
            <WorkspaceLink to="/w/$workspaceId/members" icon={<Users size={16} aria-hidden />}>
              Members
            </WorkspaceLink>
            <WorkspaceLink
              to="/w/$workspaceId/settings"
              icon={<SlidersHorizontal size={16} aria-hidden />}
            >
              Settings
            </WorkspaceLink>
          </div>
        ) : null}
      </div>

      <AccountMenu roleLabel={ROLE_LABELS[currentRole]} />
    </nav>
  );
}

function ProjectLink({
  project,
  to,
  on,
  icon,
  badge,
  children,
}: {
  project: ProjectListItem;
  to: ProjectTab;
  on: boolean;
  icon: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  return (
    <Link
      to={`/w/$workspaceId/p/$projectId/${to}`}
      params={{ workspaceId, projectId: project.id }}
      className={cn(navItem, on ? navOn : navOff)}
      aria-current={on ? "page" : undefined}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {badge}
    </Link>
  );
}

/**
 * Switches the selected project and stays on the same page of it (Tasks, My
 * work, Members…). Archived projects are listed apart and can't be opened;
 * the owner restores them in workspace settings (S13). Creating a project is
 * owner-only (P01).
 */
function ProjectMenu({ onCreateProject }: { onCreateProject: () => void }) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const selected = useSelectedProject();
  const tab = useCurrentTab();
  const navigate = useNavigate();
  const isOwner = workspace.role === "WORKSPACE_OWNER";
  const unread = useChatState((s) => s.unread);

  if (projects.length === 0) return null;
  // Chat arriving in the projects not on screen.
  const elsewhere = projects.reduce(
    (n, p) => (p.id === selected?.id ? n : n + unreadIn(unread, p.id)),
    0,
  );
  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  const open = (project: ProjectListItem) => {
    // Settings are for owners and admins; a member lands on the board instead.
    const to = !tab || (tab === "settings" && !canManage(isOwner, project)) ? "board" : tab;
    void navigate({
      to: `/w/$workspaceId/p/$projectId/${to}`,
      params: { workspaceId, projectId: project.id },
    });
  };

  return (
    <MenuRoot>
      <MenuTrigger className="flex min-h-11 w-full items-center gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-hover data-[popup-open]:bg-hover">
        {/* The name read out starts with the action, then the visible text. */}
        <span className="sr-only">Switch project: </span>
        {selected ? (
          <>
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: selected.color }}
            >
              {selected.key.slice(0, 2)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-semibold text-ink">{selected.name}</span>
              <span className="text-xs text-muted">
                {selected.archivedAt
                  ? "Archived"
                  : `${selected._count.tasks} open task${selected._count.tasks === 1 ? "" : "s"}`}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted">Choose a project</span>
        )}
        {elsewhere ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-2xs font-semibold text-white">
            {elsewhere > 99 ? "99+" : elsewhere}
            <span className="sr-only"> unread in other projects</span>
          </span>
        ) : null}
        <ChevronsUpDown size={16} className="text-muted" aria-hidden />
      </MenuTrigger>
      <MenuPopup matchTrigger>
        <MenuLabel>Projects</MenuLabel>
        {active.map((p) => (
          <MenuItem key={p.id} onClick={() => open(p)}>
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-[3px]"
              style={{ background: p.color }}
            />
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === selected?.id ? (
              <span className="text-xs text-muted">current</span>
            ) : unreadIn(unread, p.id) ? (
              <UnreadBadge count={unreadIn(unread, p.id)} />
            ) : (
              <span className="text-xs text-muted">{p._count.tasks}</span>
            )}
          </MenuItem>
        ))}
        {active.length === 0 ? (
          <span className="px-2.5 py-1.5 text-sm text-muted">No active projects</span>
        ) : null}
        {archived.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Archived</MenuLabel>
            {archived.map((p) => (
              <MenuItem key={p.id} disabled className="text-faint data-[disabled]:cursor-default">
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-[3px] opacity-50"
                  style={{ background: p.color }}
                />
                <span className="flex-1 truncate">{p.name}</span>
              </MenuItem>
            ))}
          </>
        ) : null}
        {isOwner ? (
          <>
            <MenuSeparator />
            <MenuItem onClick={onCreateProject}>+ New project</MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </MenuRoot>
  );
}

function WorkspaceLink({
  to,
  icon,
  children,
}: {
  to: "/w/$workspaceId/members" | "/w/$workspaceId/settings";
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
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-base font-bold text-white">
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
