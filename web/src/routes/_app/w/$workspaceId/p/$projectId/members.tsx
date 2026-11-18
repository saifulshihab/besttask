import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ellipsis, Lock, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, SearchClear } from "@/components/ui/field";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { ROLE_LABELS, roleBadge } from "@/lib/design";
import { plural } from "@/lib/format";
import { useSetProjectMember } from "@/lib/project-mutations";
import { meQuery, projectCandidatesQuery, projectMembersQuery, projectQuery } from "@/lib/queries";
import type { ProjectPerson, Role } from "@/lib/types";

type ProjectRole = Exclude<Role, "WORKSPACE_OWNER">;

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/members")({
  loader: ({ context: { queryClient }, params: { projectId } }) =>
    queryClient.ensureQueryData(projectMembersQuery(projectId)),
  component: ProjectMembers,
});

function ProjectMembers() {
  const { projectId } = Route.useParams();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: people } = useSuspenseQuery(projectMembersQuery(projectId));
  const { data: me } = useSuspenseQuery(meQuery);
  const setMember = useSetProjectMember(projectId);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<ProjectPerson | null>(null);
  const [removing, setRemoving] = useState<ProjectPerson | null>(null);

  const canManage = project.role !== "MEMBER" && !project.archivedAt;
  const full = project.seatsUsed >= project.seats;
  const query = q.trim().toLowerCase();
  const shown = people.filter(
    (p) => !query || `${p.user.name} ${p.user.email}`.toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-1 justify-center bg-row-hover">
      <div className="box-border flex w-full max-w-[820px] flex-col gap-4 px-7 pt-6 pb-12">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
            <h2 className="m-0 text-[17px] font-bold">Project team</h2>
            <span className="text-sm text-muted">{plural(people.length, "member")}</span>
          </div>
          <label className="flex h-9 min-w-[200px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-muted focus-within:border-accent">
            <Search size={14} aria-hidden />
            <span className="sr-only">Find a member</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a member"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            {q ? <SearchClear onClear={() => setQ("")} className="-mr-1" /> : null}
          </label>
          {canManage ? (
            <>
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap",
                  full ? "border-danger-line bg-danger-soft text-danger-ink" : "border-line bg-menu-hover text-ink-2",
                )}
              >
                {project.seatsUsed} of {project.seats} seats
              </span>
              <Tooltip content="Seat limit reached. The workspace owner can add seats." disabled={!full} wrap>
                <Button variant="primary" disabled={full} onClick={() => setAdding(true)}>
                  <Plus size={15} strokeWidth={2.4} aria-hidden />
                  Add people
                </Button>
              </Tooltip>
            </>
          ) : null}
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas px-3.5 py-3">
          <Lock size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span className="flex-1 text-sm leading-normal text-ink-2">
            Private: only the people below can see {project.name}. The workspace owner always can.
          </span>
        </div>

        <ul className="m-0 list-none overflow-hidden rounded-xl border border-line bg-canvas p-0">
          {shown.map((person) => {
            const isOwner = person.role === "WORKSPACE_OWNER";
            const isMe = person.userId === me.id;
            // Admins cannot change their own role or remove themselves (P10, P11).
            const manageable = canManage && !isOwner && !(isMe && project.role !== "WORKSPACE_OWNER");
            return (
              <li
                key={person.userId}
                className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
              >
                <Avatar user={person.user} size="lg" />
                <span className="flex min-w-[180px] flex-1 flex-col">
                  <span className="truncate font-medium">
                    {person.user.name}{" "}
                    {isMe ? <span className="font-normal text-muted">(you)</span> : null}
                    {!person.active ? <span className="font-normal text-muted"> · deactivated</span> : null}
                  </span>
                  <span className="truncate text-xs text-muted">{person.user.email}</span>
                </span>
                <span
                  className={cn(
                    "inline-flex h-[26px] items-center rounded-full border px-2.5 text-xs font-semibold",
                    roleBadge(person.role),
                  )}
                >
                  {ROLE_LABELS[person.role]}
                </span>
                {manageable ? (
                  <MenuRoot>
                    <MenuTrigger
                      aria-label={`Actions for ${person.user.name}`}
                      className="flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-hover"
                    >
                      <Ellipsis size={16} aria-hidden />
                    </MenuTrigger>
                    <MenuPopup align="end" className="w-[200px]">
                      <MenuItem onClick={() => setManaging(person)}>Manage role</MenuItem>
                      <MenuItem tone="danger" onClick={() => setRemoving(person)}>
                        Remove from project
                      </MenuItem>
                    </MenuPopup>
                  </MenuRoot>
                ) : null}
              </li>
            );
          })}
          {shown.length === 0 ? (
            <li className="px-4 py-5 text-sm text-muted">No one matches “{q.trim()}”.</li>
          ) : null}
        </ul>

        <section className="rounded-xl border border-line bg-canvas px-4 py-3">
          <h3 className="m-0 flex min-h-7 items-center text-sm font-semibold">What each role can do</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 pt-2.5 text-sm leading-normal text-ink-2">
            <span>
              <b className="text-ink">Admin</b>
              <br />
              Everything members can do, plus project settings and the project team.
            </span>
            <span>
              <b className="text-ink">Member</b>
              <br />
              Create, edit, move and delete tasks; comment; manage labels on tasks.
            </span>
          </div>
        </section>
      </div>

      {adding ? <AddPeopleDialog projectId={projectId} projectName={project.name} onClose={() => setAdding(false)} /> : null}
      {managing ? (
        <ManageRoleDialog
          person={managing}
          pending={setMember.isPending}
          onClose={() => setManaging(null)}
          onSave={(role) =>
            setMember.mutate(
              { userId: managing.userId, role },
              { onSuccess: () => (setManaging(null), toast(`${managing.user.name} is now ${ROLE_LABELS[role]}`)) },
            )
          }
        />
      ) : null}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.user.name ?? ""} from ${project.name}?`}
        body="They lose access to this project and its tasks are unassigned from them. Their comments and history stay."
        confirmLabel="Remove"
        pending={setMember.isPending}
        onConfirm={() =>
          removing &&
          setMember.mutate(
            { userId: removing.userId, role: null },
            { onSuccess: () => (setRemoving(null), toast(`Removed ${removing.user.name}`)) },
          )
        }
      />
    </div>
  );
}

function AddPeopleDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const candidates = useQuery(projectCandidatesQuery(projectId));
  const setMember = useSetProjectMember(projectId);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("MEMBER");
  const list = candidates.data ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const person = list.find((c) => c.userId === userId);
    if (!person) return;
    setMember.mutate(
      { userId, role, isNew: true },
      { onSuccess: () => (onClose(), toast(`Added ${person.user.name} to ${projectName}`)) },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Add people to ${projectName}`}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Person" hint="People must be in the workspace first. The workspace owner adds them from Members.">
          <Select
            autoFocus
            size="lg"
            value={userId}
            onValueChange={setUserId}
            disabled={candidates.isPending || list.length === 0}
            placeholder={
              candidates.isPending
                ? "Loading…"
                : list.length
                  ? "Choose someone"
                  : "Everyone in the workspace is already here"
            }
            options={list.map((c) => ({
              value: c.userId,
              label: c.user.name,
              hint: c.user.email,
              icon: <Avatar user={c.user} size="xs" />,
            }))}
          />
        </Field>
        <Field label="Project role">
          <Select
            value={role}
            onValueChange={setRole}
            options={[
              { value: "MEMBER", label: "Member", hint: "Can create and edit tasks" },
              { value: "ADMIN", label: "Admin", hint: "Can manage settings and members" },
            ]}
          />
        </Field>
        {setMember.error ? (
          <span role="alert" className="text-xs text-danger">
            {setMember.error.message}
          </span>
        ) : null}
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" type="submit" disabled={!userId || setMember.isPending}>
            Add to project
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function ManageRoleDialog({
  person,
  pending,
  onClose,
  onSave,
}: {
  person: ProjectPerson;
  pending: boolean;
  onClose: () => void;
  onSave: (role: ProjectRole) => void;
}) {
  const [role, setRole] = useState<ProjectRole>(person.role === "ADMIN" ? "ADMIN" : "MEMBER");
  const option = (value: ProjectRole, name: string, text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={role === value}
      onClick={() => setRole(value)}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-left",
        role === value ? "border-accent bg-accent-tint ring-1 ring-accent" : "border-line bg-canvas hover:bg-row-hover",
      )}
    >
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs leading-[1.4] text-muted">{text}</span>
    </button>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Manage role">
      <div className="flex items-center gap-3">
        <Avatar user={person.user} size="lg" />
        <span className="flex flex-col">
          <span className="font-medium">{person.user.name}</span>
          <span className="text-xs text-muted">{person.user.email}</span>
        </span>
      </div>
      <div role="radiogroup" aria-label="Project role" className="grid grid-cols-2 gap-2.5">
        {option("MEMBER", "Member", "Create, edit and move tasks, comment and manage labels.")}
        {option("ADMIN", "Admin", "Everything a member can do, plus project settings and people.")}
      </div>
      <DialogFooter>
        <Button size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button size="lg" variant="primary" disabled={pending} onClick={() => onSave(role)}>
          Save role
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
