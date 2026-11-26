import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { projectTasksQuery, workspaceQuery } from "@/lib/queries";
import { useSelectedProject } from "@/lib/selected-project";
import { useOpener } from "@/lib/use-opener";
import type { ProjectTab } from "./project-tabs";

interface Item {
  id: string;
  kind: string;
  label: string;
  hint: string;
  run: () => void;
}

const TASK_RESULTS = 8;

const PAGES: { tab: ProjectTab; label: string; manage?: true }[] = [
  { tab: "board", label: "Board" },
  { tab: "list", label: "List" },
  { tab: "calendar", label: "Calendar" },
  { tab: "my-work", label: "My work" },
  { tab: "chat", label: "Chat" },
  { tab: "activity", label: "Activity" },
  { tab: "members", label: "Members" },
  { tab: "settings", label: "Settings", manage: true },
];

/**
 * Searches the selected project only: its tasks by title, description and ID
 * (V01), and its pages (V02). Other projects are reached with the switcher.
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
  const project = useSelectedProject();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const needle = useDeferredValue(text.trim().toLowerCase());
  // The board's own list: usually cached already, and searched locally.
  const tasks = useQuery({ ...projectTasksQuery(project?.id ?? ""), enabled: open && !!project });

  const items = useMemo<Item[]>(() => {
    if (!project) return [];
    const close = (go: () => void) => () => {
      onOpenChange(false);
      setText("");
      go();
    };
    const params = { workspaceId, projectId: project.id };
    const manage = workspace.role === "WORKSPACE_OWNER" || project.role !== "MEMBER";
    const pages: Item[] = PAGES.filter((p) => !p.manage || manage)
      .filter((p) => !needle || p.label.toLowerCase().includes(needle))
      .map((p) => ({
        id: `page-${p.tab}`,
        kind: "Page",
        label: p.label,
        hint: project.name,
        run: close(() => navigate({ to: `/w/$workspaceId/p/$projectId/${p.tab}`, params })),
      }));
    const found: Item[] = needle
      ? (tasks.data ?? [])
          .filter((t) =>
            `${t.title} ${t.description ?? ""} ${t.key}`.toLowerCase().includes(needle),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, TASK_RESULTS)
          .map((t) => ({
            id: t.id,
            kind: "Task",
            label: `${t.key} ${t.title}`,
            hint: "",
            run: close(() =>
              navigate({ to: "/w/$workspaceId/p/$projectId/board", params, search: { task: t.id } }),
            ),
          }))
      : [];
    return [...found, ...pages];
  }, [project, workspace.role, workspaceId, navigate, onOpenChange, needle, tasks.data]);

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
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-backdrop" />
        <BaseDialog.Popup finalFocus={opener} className="fixed top-20 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-raised shadow-modal ring-1 ring-raised-edge outline-none">
          <BaseDialog.Title className="sr-only">Search</BaseDialog.Title>
          <form onSubmit={submit} className="flex items-center gap-2.5 border-b border-line px-4">
            <Search size={16} className="text-muted" aria-hidden />
            <input
              autoFocus
              aria-label={project ? `Search ${project.name}` : "Search"}
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
              placeholder={project ? `Search tasks or pages in ${project.name}` : "Search"}
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
              <p className="m-0 p-4 text-sm text-muted">
                {project ? (tasks.isPending && needle ? "Searching…" : "No matches.") : "No project selected."}
              </p>
            ) : null}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
