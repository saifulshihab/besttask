import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Paginated, Task } from "@/lib/types";
import { cn } from "@/lib/cn";
import { projectsQuery, workspaceQuery } from "@/lib/queries";
import { useOpener } from "@/lib/use-opener";

interface Item {
  id: string;
  kind: string;
  label: string;
  hint: string;
  run: () => void;
}

/**
 * Jump to a project or page. Task search joins this list with the board
 * screen, which brings the task queries it needs.
 */
export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const q = useDeferredValue(text.trim());
  // Server-side search across the projects the user can see (V02).
  const taskResults = useQuery<Task[]>({
    queryKey: ["workspace", workspaceId, "task-search", q],
    queryFn: ({ signal }) =>
      api<Paginated<Task>>(`/workspaces/${workspaceId}/tasks`, {
        query: { search: q, pageSize: 8, sort: "-updatedAt" },
        signal,
      }).then((r) => r.data),
    enabled: open && q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const items = useMemo<Item[]>(() => {
    const close = (go: () => void) => () => {
      onOpenChange(false);
      setText("");
      go();
    };
    const all: Item[] = [
      ...projects
        .filter((p) => !p.archivedAt)
        .flatMap((p) =>
          (["board", "list", "calendar"] as const).map((tab) => ({
            id: `${p.id}-${tab}`,
            kind: "Project",
            label: `${p.name} · ${tab.charAt(0).toUpperCase()}${tab.slice(1)}`,
            hint: p.key,
            run: close(() =>
              navigate({
                to: `/w/$workspaceId/p/$projectId/${tab}`,
                params: { workspaceId, projectId: p.id },
              }),
            ),
          })),
        ),
      {
        id: "my-work",
        kind: "Page",
        label: "My work",
        hint: workspace.name,
        run: close(() => navigate({ to: "/w/$workspaceId/my-work", params: { workspaceId } })),
      },
      {
        id: "notifications",
        kind: "Page",
        label: "Notifications",
        hint: workspace.name,
        run: close(() => navigate({ to: "/w/$workspaceId/notifications", params: { workspaceId } })),
      },
      {
        id: "activity",
        kind: "Page",
        label: "Activity",
        hint: workspace.name,
        run: close(() => navigate({ to: "/w/$workspaceId/activity", params: { workspaceId } })),
      },
      {
        id: "members",
        kind: "Page",
        label: "Members",
        hint: workspace.name,
        run: close(() => navigate({ to: "/w/$workspaceId/members", params: { workspaceId } })),
      },
      {
        id: "profile",
        kind: "Page",
        label: "Profile",
        hint: "",
        run: close(() => navigate({ to: "/w/$workspaceId/profile", params: { workspaceId } })),
      },
      {
        id: "account",
        kind: "Page",
        label: "Account settings",
        hint: "",
        run: close(() => navigate({ to: "/w/$workspaceId/account", params: { workspaceId } })),
      },
    ];
    const needle = text.trim().toLowerCase();
    const pages = needle ? all.filter((i) => i.label.toLowerCase().includes(needle)) : all;
    const tasks: Item[] =
      needle.length >= 2
        ? (taskResults.data ?? []).map((t) => ({
            id: t.id,
            kind: "Task",
            label: `${t.key} ${t.title}`,
            hint: t.project.name,
            run: close(() =>
              navigate({
                to: "/w/$workspaceId/p/$projectId/board",
                params: { workspaceId, projectId: t.projectId },
                search: { task: t.id },
              }),
            ),
          }))
        : [];
    return [...tasks, ...pages];
  }, [projects, workspace.name, workspaceId, navigate, onOpenChange, text, taskResults.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    items[highlight]?.run();
  };

  const opener = useOpener(open);
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setText("");
        onOpenChange(next);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-[rgba(28,25,23,0.36)]" />
        <BaseDialog.Popup finalFocus={opener} className="fixed top-20 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-canvas shadow-modal outline-none">
          <BaseDialog.Title className="sr-only">Search</BaseDialog.Title>
          <form onSubmit={submit} className="flex items-center gap-2.5 border-b border-line px-4">
            <Search size={16} className="text-muted" aria-hidden />
            <input
              autoFocus
              aria-label="Search tasks, projects and pages"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                }
              }}
              placeholder="Search tasks, or jump to a project or page"
              className="h-[52px] flex-1 border-0 text-md outline-none"
            />
          </form>
          <div role="listbox" aria-label="Results" className="max-h-[360px] overflow-y-auto p-1.5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={item.run}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-base text-ink",
                  index === highlight && "bg-menu-hover",
                )}
              >
                <span className="w-[54px] text-2xs font-semibold text-muted">{item.kind}</span>
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted">{item.hint}</span>
              </button>
            ))}
            {items.length === 0 ? (
              <p className="m-0 p-4 text-sm text-muted">No matches.</p>
            ) : null}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
