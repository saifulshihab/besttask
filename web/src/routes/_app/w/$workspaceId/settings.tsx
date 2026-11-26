import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast, toastError } from "@/lib/toast";
import { Page, PageHeader } from "@/components/page";
import { SeatMeter, SeatStepper } from "@/components/seats";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { seatState } from "@/lib/design";
import { useRestoreProject } from "@/lib/mutations";
import { useUpdateProject } from "@/lib/project-mutations";
import { projectsQuery, workspaceMembersQuery, workspaceQuery } from "@/lib/queries";
import type { ProjectListItem, Role } from "@/lib/types";
import {
  useDeleteWorkspace,
  useRenameWorkspace,
  useTransferOwnership,
} from "@/lib/workspace-mutations";

export const Route = createFileRoute("/_app/w/$workspaceId/settings")({
  loader: async ({ context: { queryClient }, params }) => {
    const workspace = await queryClient.ensureQueryData(workspaceQuery(params.workspaceId));
    // Workspace settings are owner-only (W03).
    if (workspace.role !== "WORKSPACE_OWNER")
      throw redirect({ to: "/w/$workspaceId", params, replace: true });
    void queryClient.prefetchQuery(workspaceMembersQuery(params.workspaceId));
  },
  component: WorkspaceSettings,
});

const card = "flex flex-col gap-3.5 rounded-xl border border-line bg-canvas p-[18px]";

function WorkspaceSettings() {
  const { workspaceId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const rename = useRenameWorkspace(workspaceId);
  const remove = useDeleteWorkspace(workspaceId);
  const [name, setName] = useState(workspace.name);
  const [deleting, setDeleting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate(name.trim(), { onSuccess: () => toast("Workspace renamed") });
  };

  return (
    <Page tinted>
        <PageHeader title="Workspace settings" description={`Name, seats and ownership for ${workspace.name}.`} />

        <form onSubmit={saveName} className="flex flex-col gap-2.5 rounded-xl border border-line bg-canvas p-[18px]">
          <label htmlFor="ws-name" className="text-sm font-semibold">
            Workspace name
          </label>
          <input
            id="ws-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            className="h-[38px] rounded-md border border-line-strong px-3 text-base outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || name.trim() === workspace.name || rename.isPending}
            >
              Save changes
            </Button>
            <span className="text-xs text-muted">Shown in the sidebar.</span>
          </div>
        </form>

        <section className={card}>
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-md font-semibold">Project seats</h2>
            <p className="m-0 text-sm text-muted">
              Each person on a project uses one seat in that project. You, as workspace owner, don’t use a seat.
              Project admins can see the limit but only you can change it.
            </p>
          </div>
          {active.length > 1 ? (
            <p className="m-0 text-xs text-muted">
              <span className="font-semibold text-ink-2">
                {active.reduce((n, p) => n + p._count.members, 0)} of {active.reduce((n, p) => n + p.seats, 0)}
              </span>{" "}
              seats used across {active.length} projects
            </p>
          ) : null}
          <ul className="@container m-0 list-none overflow-hidden rounded-xl border border-line p-0">
            {active.map((project) => (
              <SeatRow key={project.id} workspaceId={workspaceId} project={project} />
            ))}
            {active.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted">No projects yet.</li>
            ) : null}
          </ul>
        </section>

        <section className={card}>
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-md font-semibold">Archived projects</h2>
            <p className="m-0 text-sm text-muted">
              Archived projects are read-only and can’t be opened from the project switcher. Restoring one makes it
              editable again for everyone on it.
            </p>
          </div>
          <ul className="m-0 list-none overflow-hidden rounded-xl border border-line p-0">
            {archived.map((project) => (
              <ArchivedRow key={project.id} workspaceId={workspaceId} project={project} />
            ))}
            {archived.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted">No archived projects.</li>
            ) : null}
          </ul>
        </section>

        <section className={card}>
          <div className="flex flex-col gap-0.5">
            <h2 className="m-0 text-md font-semibold">Transfer ownership</h2>
            <p className="m-0 text-sm text-muted">
              Hand {workspace.name} to another active member. A workspace has exactly one owner; you choose which
              projects you stay on, and as what.
            </p>
          </div>
          <div>
            <Button onClick={() => setTransferring(true)}>Transfer ownership…</Button>
          </div>
        </section>

        <section className="flex flex-col items-start gap-2 rounded-xl border border-danger-line bg-canvas p-[18px]">
          <h2 className="m-0 text-md font-semibold text-danger-ink">Delete workspace</h2>
          <p className="m-0 text-sm leading-normal text-muted">
            Removes {workspace.name} with all of its projects, tasks and activity. You’ll be asked to type the name to
            confirm.
          </p>
          <Button onClick={() => setDeleting(true)} className="border-[#FCA5A5] font-semibold text-danger hover:bg-danger-soft">
            Delete workspace…
          </Button>
        </section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${workspace.name}?`}
        body={`All projects, tasks and activity in ${workspace.name} will be removed. This can’t be undone.`}
        confirmLabel="Delete workspace"
        typeToConfirm={workspace.name}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast(`Deleted ${workspace.name}`);
              void navigate({ to: "/", replace: true });
            },
          })
        }
      />
      {transferring ? (
        <TransferDialog
          workspaceId={workspaceId}
          projects={active}
          onClose={() => setTransferring(false)}
          onDone={() => void navigate({ to: "/w/$workspaceId", params: { workspaceId }, replace: true })}
        />
      ) : null}
    </Page>
  );
}

function SeatRow({ workspaceId, project }: { workspaceId: string; project: ProjectListItem }) {
  const update = useUpdateProject(workspaceId, project.id);
  const used = project._count.members;
  return (
    <li className="grid grid-cols-1 items-center gap-x-8 gap-y-3 border-b @md:grid-cols-[minmax(0,1fr)_auto] border-line-soft px-4 py-3.5 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: project.color }} />
          <span className="truncate text-sm font-semibold">{project.name}</span>
        </span>
        <SeatMeter used={used} limit={project.seats} state={seatState(used, project.seats)} className="max-w-[420px]" />
      </span>
      <SeatStepper
        className="justify-self-start"
        value={project.seats}
        min={Math.max(1, used)}
        onChange={(seats) =>
          seats !== project.seats &&
          update.mutate({ seats }, { onSuccess: () => toast(`${project.name}: ${seats} seats`) })
        }
      />
    </li>
  );
}

/** An archived project with Restore (S13, owner only like this page). */
function ArchivedRow({ workspaceId, project }: { workspaceId: string; project: ProjectListItem }) {
  const restore = useRestoreProject(workspaceId);
  const navigate = Route.useNavigate();
  return (
    <li className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: project.color }} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{project.name}</span>
        <span className="text-xs text-muted">
          {project.key} · {project._count.members} member{project._count.members === 1 ? "" : "s"}
        </span>
      </span>
      <Button
        disabled={restore.isPending}
        onClick={() =>
          restore.mutate(project.id, {
            onSuccess: () => {
              toast(`Restored ${project.name}`);
              void navigate({
                to: "/w/$workspaceId/p/$projectId/board",
                params: { workspaceId, projectId: project.id },
              });
            },
            onError: (error) => toastError(error),
          })
        }
      >
        {restore.isPending ? "Restoring…" : "Restore"}
      </Button>
    </li>
  );
}

type Keep = Exclude<Role, "WORKSPACE_OWNER"> | "NONE";

function TransferDialog({
  workspaceId,
  projects,
  onClose,
  onDone,
}: {
  workspaceId: string;
  projects: ProjectListItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: members } = useSuspenseQuery(workspaceMembersQuery(workspaceId));
  const transfer = useTransferOwnership(workspaceId);
  const candidates = members.filter((m) => m.role !== "WORKSPACE_OWNER" && m.active);
  const [userId, setUserId] = useState("");
  const [keep, setKeep] = useState<Record<string, Keep>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, "ADMIN" as Keep])),
  );
  const [confirm, setConfirm] = useState(false);
  const next = candidates.find((m) => m.userId === userId);

  const submit = () =>
    transfer.mutate(
      {
        userId,
        assignments: projects.flatMap((p) =>
          keep[p.id] && keep[p.id] !== "NONE"
            ? [{ projectId: p.id, role: keep[p.id] as Exclude<Keep, "NONE"> }]
            : [],
        ),
      },
      {
        onSuccess: () => {
          toast(`${next?.user.name ?? "They"} now own the workspace`);
          onDone();
        },
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Transfer ownership" width="max-w-[520px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (userId) setConfirm(true);
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="New owner">
          <Select
            autoFocus
            size="lg"
            value={userId}
            onValueChange={setUserId}
            disabled={!candidates.length}
            placeholder={candidates.length ? "Choose an active member" : "No other active members"}
            options={candidates.map((m) => ({
              value: m.userId,
              label: m.user.name,
              hint: m.user.email,
              icon: <Avatar user={m.user} size="xs" />,
            }))}
          />
        </Field>
        {projects.length ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 text-xs font-semibold">Your place on each project afterwards</legend>
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{p.name}</span>
                <Select
                  size="sm"
                  aria-label={`Your role on ${p.name}`}
                  value={keep[p.id] ?? "NONE"}
                  onValueChange={(v: Keep) => setKeep((k) => ({ ...k, [p.id]: v }))}
                  className="w-auto min-w-[150px]"
                  options={[
                    { value: "ADMIN", label: "Admin" },
                    { value: "MEMBER", label: "Member" },
                    { value: "NONE", label: "Not on project" },
                  ]}
                />
              </label>
            ))}
          </fieldset>
        ) : null}
        {transfer.error ? (
          <span role="alert" className="text-xs text-danger">
            {transfer.error.message}
          </span>
        ) : null}
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" type="submit" disabled={!userId}>
            Continue
          </Button>
        </DialogFooter>
      </form>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Make ${next?.user.name ?? ""} the owner?`}
        body="You’ll lose owner access to this workspace, including its settings and members page."
        confirmLabel="Transfer ownership"
        pending={transfer.isPending}
        onConfirm={submit}
      />
    </Dialog>
  );
}
