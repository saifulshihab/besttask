import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { MenuItem, MenuPopup, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, roleBadge } from "@/lib/design";
import { plural } from "@/lib/format";
import { meQuery, projectsQuery, workspaceMembersQuery, workspaceQuery } from "@/lib/queries";
import type { WorkspaceMember } from "@/lib/types";
import {
  useAddWorkspaceMember,
  useRemoveWorkspaceMember,
  useSetMemberActive,
} from "@/lib/workspace-mutations";

export const Route = createFileRoute("/_app/w/$workspaceId/members")({
  validateSearch: z.object({ project: z.string().optional().catch(undefined) }),
  loader: async ({ context: { queryClient }, params }) => {
    const workspace = await queryClient.ensureQueryData(workspaceQuery(params.workspaceId));
    // The workspace directory is owner-only (U01).
    if (workspace.role !== "WORKSPACE_OWNER")
      throw redirect({ to: "/w/$workspaceId", params, replace: true });
    await queryClient.ensureQueryData(workspaceMembersQuery(params.workspaceId));
  },
  component: WorkspaceMembers,
});

function WorkspaceMembers() {
  const { workspaceId } = Route.useParams();
  const { project: projectFilter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: members } = useSuspenseQuery(workspaceMembersQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const { data: me } = useSuspenseQuery(meQuery);
  const setActive = useSetMemberActive(workspaceId);
  const remove = useRemoveWorkspaceMember(workspaceId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  const owner = members.find((m) => m.role === "WORKSPACE_OWNER");
  const people = members
    .filter((m) => m.role !== "WORKSPACE_OWNER")
    .filter((m) => !projectFilter || m.projects.some((p) => p.projectId === projectFilter));
  const activeProjects = projects.filter((p) => !p.archivedAt);

  return (
    <Page>
        <PageHeader
          title="Members"
          description={`People in ${workspace.name}, and the projects they belong to.`}
          actions={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add user
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span>Project</span>
            <Select
              value={projectFilter ?? ""}
              onValueChange={(v) =>
                void navigate({ search: { project: v || undefined }, replace: true })
              }
              size="sm"
              className="w-auto min-w-[200px] font-normal"
              options={[
                { value: "", label: "All projects" },
                ...activeProjects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
          <span className="flex-1 text-xs text-muted">
            {plural(people.length, "person", "people")}
            {projectFilter ? " on this project" : " besides you"}
          </span>
        </div>

        {owner ? (
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-sm font-semibold text-muted">Workspace owner</h2>
            <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-canvas p-0">
              <li className="flex items-center gap-3 px-4 py-3">
                <Avatar user={owner.user} size="lg" className="size-8" />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">{owner.user.name}</span>
                  <span className="text-xs text-muted">{owner.userId === me.id ? "You" : owner.user.email}</span>
                </span>
                <span
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold",
                    roleBadge("WORKSPACE_OWNER"),
                  )}
                >
                  Workspace Owner
                </span>
              </li>
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-semibold text-muted">Project members</h2>
          <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-canvas p-0">
            {people.map((m) => {
              const inFilter = projectFilter ? m.projects.find((p) => p.projectId === projectFilter) : undefined;
              return (
                <li key={m.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
                  <Avatar user={m.user} size="lg" className={cn("size-8", !m.active && "opacity-50")} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">
                      {m.user.name}
                      {!m.active ? <span className="ml-1.5 text-xs font-normal text-muted">Deactivated</span> : null}
                    </span>
                    <span className="truncate text-xs text-muted">{m.user.email}</span>
                    {!projectFilter ? (
                      <span className="flex flex-wrap gap-1">
                        {m.projects.length ? (
                          m.projects.map((p) => (
                            <span
                              key={p.projectId}
                              className="inline-flex h-5 items-center rounded-sm bg-menu-hover px-1.5 text-2xs text-ink-2"
                            >
                              {p.project.name} · {ROLE_LABELS[p.role]}
                            </span>
                          ))
                        ) : (
                          <span className="text-2xs text-muted">Not on any project yet</span>
                        )}
                      </span>
                    ) : null}
                  </span>
                  {inFilter ? (
                    <span
                      className={cn(
                        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold",
                        roleBadge(inFilter.role),
                      )}
                    >
                      {ROLE_LABELS[inFilter.role]}
                    </span>
                  ) : null}
                  <MenuRoot>
                    <MenuTrigger
                      aria-label={`Actions for ${m.user.name}`}
                      className="flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-hover"
                    >
                      <Ellipsis size={16} aria-hidden />
                    </MenuTrigger>
                    <MenuPopup align="end" className="w-[220px]">
                      <MenuItem
                        onClick={() =>
                          setActive.mutate(
                            { userId: m.userId, active: !m.active },
                            { onSuccess: () => toast(`${m.active ? "Deactivated" : "Reactivated"} ${m.user.name}`) },
                          )
                        }
                      >
                        {m.active ? "Deactivate" : "Reactivate"}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem tone="danger" onClick={() => setRemoving(m)}>
                        Remove from workspace…
                      </MenuItem>
                    </MenuPopup>
                  </MenuRoot>
                </li>
              );
            })}
            {people.length === 0 ? (
              <li className="p-7 text-center text-sm text-muted">
                {projectFilter
                  ? "No one is on this project yet besides you."
                  : "No one else is in this workspace yet. Add people who already have a BestTask account."}
              </li>
            ) : null}
          </ul>
          <p className="m-0 text-xs leading-normal text-muted">
            Deactivating keeps someone’s project places and seats but signs them out of this workspace and unassigns
            their tasks. Removing takes them off every project; their comments and history stay.
          </p>
        </section>

      {adding ? <AddUserDialog workspaceId={workspaceId} onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.user.name ?? ""} from ${workspace.name}?`}
        body="They lose access to every project here and their tasks are unassigned. Their account, comments and history stay. You can undo right after."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate({ userId: removing.userId, name: removing.user.name }, { onSuccess: () => setRemoving(null) })
        }
      />
    </Page>
  );
}

function AddUserDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const add = useAddWorkspaceMember(workspaceId);
  const [email, setEmail] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(email.trim(), { onSuccess: () => (onClose(), toast(`Added ${email.trim()}`)) });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Add user">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field
          label="Email address"
          error={add.error?.message}
          hint="They need a BestTask account already. Adding them doesn’t put them on a project: do that from the project’s Members tab."
        >
          <Input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </Field>
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" type="submit" disabled={!email.trim() || add.isPending}>
            Add user
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
