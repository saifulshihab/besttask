import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { useCreateProject, useCreateWorkspace } from "@/lib/mutations";
import { useIsMobile } from "@/lib/use-mobile";
import { NameDialog } from "./name-dialog";
import { SearchPalette } from "./search-palette";
import { Sidebar } from "./sidebar";

type Modal = "workspace" | "project" | "search" | null;

/** Sidebar plus main column, and the dialogs the sidebar opens. */
export function AppShell({ children }: { children: ReactNode }) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const navigate = useNavigate();
  const [modal, setModal] = useState<Modal>(null);
  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(workspaceId);
  const close = (open: boolean) => {
    if (open) return;
    setModal(null);
    // Clear a previous attempt's error so it does not show on reopen.
    createWorkspace.reset();
    createProject.reset();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mobile = useIsMobile();
  const onBoard = useRouterState({ select: (s) => s.location.pathname.endsWith("/board") });

  return (
    <div className="flex min-h-svh bg-canvas text-ink">
      {/* First stop for keyboard users: jump past the sidebar to the page. */}
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:no-underline focus:shadow-popover"
      >
        Skip to content
      </a>
      {mobile ? null : (
        <Sidebar
          onCreateWorkspace={() => setModal("workspace")}
          onCreateProject={() => setModal("project")}
          onOpenSearch={() => setModal("search")}
        />
      )}
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        {/* Phones have no sidebar: pages other than the board get a way back. */}
        {mobile && !onBoard ? (
          <div className="flex h-12 items-center border-b border-line px-2">
            <Link
              to="/w/$workspaceId"
              params={{ workspaceId }}
              className="flex h-10 items-center gap-1 rounded-md px-2 text-base font-medium text-accent-hover no-underline"
            >
              <ChevronLeft size={18} aria-hidden />
              Back to board
            </Link>
          </div>
        ) : null}
        {children}
      </main>

      <NameDialog
        open={modal === "workspace"}
        onOpenChange={close}
        title="New workspace"
        label="Workspace name"
        placeholder="e.g. Acme Studio"
        submitLabel="Create workspace"
        pending={createWorkspace.isPending}
        error={createWorkspace.error?.message}
        onSubmit={(name) =>
          createWorkspace.mutate(name, {
            onSuccess: (workspace) => {
              setModal(null);
              toast(`Created ${workspace.name}`);
              void navigate({ to: "/w/$workspaceId", params: { workspaceId: workspace.id } });
            },
          })
        }
      />
      <NameDialog
        open={modal === "project"}
        onOpenChange={close}
        title="New project"
        label="Project name"
        placeholder="e.g. Website relaunch"
        submitLabel="Create project"
        pending={createProject.isPending}
        error={createProject.error?.message}
        onSubmit={(name) =>
          createProject.mutate(name, {
            onSuccess: (project) => {
              setModal(null);
              toast(`Created ${project.name}`);
              void navigate({
                to: "/w/$workspaceId/p/$projectId/board",
                params: { workspaceId, projectId: project.id },
              });
            },
          })
        }
      />
      <SearchPalette open={modal === "search"} onOpenChange={close} />
    </div>
  );
}
