import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast, toastError } from "@/lib/toast";
import { SeatMeter, SeatStepper } from "@/components/seats";
import { LabelChip, PriorityIcon, StatusDot } from "@/components/tasks/task-badges";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  LABEL_COLOR_PRESETS,
  LABEL_COLORS,
  PRIORITIES,
  PROJECT_COLOR_PRESETS,
  seatState,
  STATUSES,
} from "@/lib/design";
import { plural } from "@/lib/format";
import {
  useArchiveProject,
  useDeleteLabel,
  useDeleteProject,
  useUpdateLabel,
  useUpdateProject,
  type ProjectPatch,
} from "@/lib/project-mutations";
import { projectLabelsQuery, projectQuery, projectTasksQuery } from "@/lib/queries";
import { useCreateLabel } from "@/lib/task-mutations";
import type { CardFields, ProjectDetail } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorButton, ColorField } from "@/components/ui/color-picker";
import { NumberStepper } from "@/components/ui/number-stepper";

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/settings")({
  loader: async ({ context: { queryClient }, params }) => {
    const project = await queryClient.ensureQueryData(projectQuery(params.projectId));
    // Settings are for the owner and project admins (S01).
    if (project.role === "MEMBER")
      throw redirect({ to: "/w/$workspaceId/p/$projectId/board", params, replace: true });
    await Promise.all([
      queryClient.ensureQueryData(projectLabelsQuery(params.projectId)),
      queryClient.ensureQueryData(projectTasksQuery(params.projectId)),
    ]);
  },
  component: ProjectSettings,
});

const SECTIONS = [
  { id: "general", name: "General" },
  { id: "defaults", name: "New task defaults" },
  { id: "board", name: "Board" },
  { id: "labels", name: "Labels" },
  { id: "seats", name: "Seats" },
  { id: "danger", name: "Archive or delete" },
] as const;

const FIELD_NAMES: { id: keyof CardFields; name: string }[] = [
  { id: "assignee", name: "Assignee" },
  { id: "due", name: "Due date" },
  { id: "labels", name: "Labels" },
  { id: "subtasks", name: "Subtask progress" },
  { id: "comments", name: "Comment count" },
];

const input =
  "h-[38px] rounded-md border border-line-strong bg-canvas px-3 text-base outline-none focus:border-accent disabled:bg-row-hover";

function ProjectSettings() {
  const { workspaceId, projectId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const update = useUpdateProject(workspaceId, projectId);
  const [savedAt, setSavedAt] = useState(0);
  const owner = project.role === "WORKSPACE_OWNER";
  const archived = !!project.archivedAt;

  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), 60_000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const save = (patch: ProjectPatch, onSuccess?: () => void) =>
    update.mutate(patch, {
      onSuccess: () => {
        setSavedAt(Date.now());
        onSuccess?.();
      },
    });

  const sections = SECTIONS.filter((s) => s.id !== "danger" || owner);

  return (
    <div className="flex flex-1 justify-center bg-row-hover">
      <div className="box-border flex w-full max-w-[1020px] flex-col gap-4 px-7 pt-6 pb-12">
        <div className="flex flex-wrap items-start gap-7">
          <nav aria-label="Settings sections" className="sticky top-4 flex flex-[0_0_180px] flex-col gap-0.5">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "flex min-h-[34px] items-center rounded-sm px-2.5 text-sm font-medium no-underline hover:bg-hover",
                  s.id === "danger" ? "text-danger" : "text-ink-2 hover:text-ink",
                )}
              >
                {s.name}
              </a>
            ))}
          </nav>
          <div className="flex max-w-[760px] min-w-0 flex-[1_1_480px] flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="flex-1">
                {archived
                  ? "This project is archived. Restore it from the sidebar to change settings."
                  : "Changes save automatically and apply to the board right away."}
              </span>
              {savedAt ? (
                <span role="status" className="inline-flex items-center gap-1 text-[#15803D]">
                  <Check size={13} aria-hidden />
                  Saved
                </span>
              ) : null}
            </div>
            <fieldset disabled={archived} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              <GeneralSection project={project} save={save} />
              <DefaultsSection project={project} save={save} />
              <BoardSection project={project} save={save} />
              <LabelsSection project={project} />
              <SeatsSection project={project} owner={owner} save={save} />
            </fieldset>
            {owner ? (
              <DangerSection
                workspaceId={workspaceId}
                project={project}
                onGone={() => void navigate({ to: "/w/$workspaceId", params: { workspaceId } })}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
  danger,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "flex scroll-mt-4 flex-col gap-4 rounded-xl border bg-canvas p-5",
        danger ? "border-danger-line" : "border-line",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className={cn("m-0 text-md font-semibold", danger && "text-danger-ink")}>{title}</h2>
        {lead ? <p className="m-0 text-sm text-muted">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

type Save = (patch: ProjectPatch, onSuccess?: () => void) => void;

function GeneralSection({ project, save }: { project: ProjectDetail; save: Save }) {
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(project.id));
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [key, setKey] = useState(project.key);
  const keyValid = /^[A-Z][A-Z0-9]{0,4}$/.test(key);
  const keyChanged = key !== project.key;

  const applyKey = (event: FormEvent) => {
    event.preventDefault();
    if (keyValid && keyChanged) save({ key }, () => toast(`Task IDs now start with ${key}`));
  };

  return (
    <Section id="general" title="General" lead="How this project appears in the sidebar, task IDs and search.">
      <div className="flex flex-wrap items-start gap-4">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
          style={{ background: project.color }}
        >
          {project.key.slice(0, 2)}
        </span>
        <div className="flex min-w-[240px] flex-1 flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Project name</span>
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== project.name && save({ name: name.trim() })}
              className={input}
            />
            {!name.trim() ? (
              <span className="text-xs text-danger">
                A project needs a name. The last saved name is kept until you type one.
              </span>
            ) : null}
          </label>
          <form onSubmit={applyKey} className="flex flex-col gap-1.5">
            <label htmlFor="project-key" className="text-sm font-semibold">
              Project key
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="project-key"
                value={key}
                maxLength={5}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className={cn(input, "w-[120px] font-semibold tracking-[0.04em]")}
              />
              <Button size="lg" type="submit" disabled={!keyValid || !keyChanged}>
                Update key
              </Button>
              <span className="text-xs text-muted">Task IDs look like {keyValid ? key : project.key}-12.</span>
            </div>
            {!keyValid && key ? (
              <span className="text-xs text-danger">Use 1–5 capital letters or digits, starting with a letter.</span>
            ) : null}
            {keyValid && keyChanged ? (
              <span className="text-xs text-warn-ink">
                Updating renames all {plural(tasks.length, "task")} ({project.key}-1 → {key}-1).
              </span>
            ) : null}
          </form>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Description</span>
            <textarea
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() =>
                description.trim() !== (project.description ?? "").trim() &&
                save({ description: description.trim() || null })
              }
              placeholder="What is this project for? Shown to project members."
              className="field-sizing-content resize-none max-h-[320px] min-h-[88px] rounded-md border border-line-strong px-3 py-2.5 text-base leading-normal outline-none focus:border-accent"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Color</span>
            <ColorField
              label="Project color"
              shape="square"
              size="lg"
              value={project.color}
              presets={PROJECT_COLOR_PRESETS}
              onChange={(color) => save({ color })}
              preview={(hex) => (
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <span
                    className="flex size-6 items-center justify-center rounded-md text-2xs font-bold text-white"
                    style={{ background: hex }}
                  >
                    {project.key.slice(0, 2)}
                  </span>
                  {project.name}
                </span>
              )}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

function DefaultsSection({ project, save }: { project: ProjectDetail; save: Save }) {
  return (
    <Section
      id="defaults"
      title="New task defaults"
      lead="Used by New task and search. Adding inside a column always uses that column’s status."
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Status</span>
          <Select
            value={project.defaultStatus}
            onValueChange={(defaultStatus) => save({ defaultStatus })}
            options={(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW"] as const).map((s) => ({
              value: s,
              label: STATUSES[s].name,
              icon: <StatusDot status={s} />,
            }))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Priority</span>
          <Select
            value={project.defaultPriority}
            onValueChange={(defaultPriority) => save({ defaultPriority })}
            options={(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((p) => ({
              value: p,
              label: PRIORITIES[p].name,
              icon: <PriorityIcon priority={p} />,
            }))}
          />
        </label>
      </div>
    </Section>
  );
}

function BoardSection({ project, save }: { project: ProjectDetail; save: Save }) {
  return (
    <Section id="board" title="Board" lead="Columns and what each card shows.">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          size="lg"
          className="mt-px"
          checked={project.showCancelled}
          onChange={() => save({ showCancelled: !project.showCancelled })}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-medium">Show the Cancelled column</span>
          <span className="text-xs text-muted">Cancelled tasks stay in List view and search either way.</span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wip-limit" className="text-sm font-semibold">
          Work-in-progress limit for In progress
        </label>
        <NumberStepper
          id="wip-limit"
          value={project.wipLimit}
          min={0}
          max={99}
          onChange={(wipLimit) => save({ wipLimit })}
          label="Work-in-progress limit"
          decrementLabel="Lower the limit"
          incrementLabel="Raise the limit"
          emptyAt={0}
          emptyLabel="No limit"
          className="h-9 self-start"
          inputClassName="w-[76px]"
        />
        <span className="text-xs text-muted">
          {project.wipLimit
            ? `The In progress column turns red above ${project.wipLimit} tasks.`
            : "No limit set. Use + or type a number to add one."}
        </span>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-semibold">Show on cards</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {FIELD_NAMES.map((f) => (
            <label
              key={f.id}
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 text-base"
            >
              <Checkbox
                checked={project.cardFields[f.id]}
                onChange={() => save({ cardFields: { ...project.cardFields, [f.id]: !project.cardFields[f.id] } })}
              />
              {f.name}
            </label>
          ))}
        </div>
      </fieldset>
    </Section>
  );
}

function LabelsSection({ project }: { project: ProjectDetail }) {
  const { data: labels } = useSuspenseQuery(projectLabelsQuery(project.id));
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(project.id));
  const create = useCreateLabel(project.id);
  const remove = useDeleteLabel(project.id);
  const update = useUpdateLabel(project.id);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[0].hex);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => (setName(""), toast(`Created label ${trimmed}`)),
        onError: (error) => toastError(error),
      },
    );
  };

  return (
    <Section
      id="labels"
      title="Labels"
      lead={`Labels belong to ${project.name} only. They appear in its task picker, filters and cards, and other projects can’t see them.`}
    >
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-2.5 rounded-xl border border-line bg-row-hover p-3.5"
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-xs font-semibold">New label</span>
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bug, Design, Marketing"
            className="h-9 rounded-md border border-line-strong bg-canvas px-2.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="flex min-h-9 items-center">
          <ColorField
            label="Label color"
            value={color}
            presets={LABEL_COLOR_PRESETS}
            onChange={setColor}
            preview={(hex) => <LabelChip label={{ name: name.trim() || "New label", color: hex }} />}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
          Create label
        </Button>
      </form>
      <ul className="m-0 list-none overflow-hidden rounded-xl border border-line p-0">
        {labels.map((label) => {
          const count = tasks.filter((t) => t.labels.some((l) => l.id === label.id)).length;
          return (
            <li key={label.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0">
              <ColorButton
                label={`Color of ${label.name}`}
                value={label.color}
                presets={LABEL_COLOR_PRESETS}
                onChange={(color) => update.mutate({ id: label.id, color })}
                preview={(hex) => <LabelChip label={{ name: label.name, color: hex }} />}
              />
              <LabelChip label={label} />
              <span className="flex-1 text-sm text-muted">{plural(count, "task")}</span>
              <button
                type="button"
                onClick={() => remove.mutate(label)}
                className="h-8 rounded-sm px-2.5 text-sm text-danger hover:bg-danger-soft"
              >
                Delete
              </button>
            </li>
          );
        })}
        {labels.length === 0 ? (
          <li className="p-7 text-center text-sm text-muted">
            No labels in {project.name} yet. Create one above, or add one while editing a task.
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

function SeatsSection({ project, owner, save }: { project: ProjectDetail; owner: boolean; save: Save }) {
  const used = project.seatsUsed;
  const limit = project.seats;
  const state = seatState(used, limit);
  const set = (n: number) => {
    const next = Math.max(Math.max(1, used), Math.min(100, n));
    if (next !== limit) save({ seats: next });
  };
  return (
    <Section
      id="seats"
      title="Seats"
      lead={`The most people who can be on ${project.name}. Everyone added to the project, Admins included, uses a seat.`}
    >
      <div className="flex flex-wrap items-center gap-3.5">
        <SeatMeter used={used} limit={limit} state={state} className="flex-[1_1_220px]" />
        {owner ? <SeatStepper value={limit} min={Math.max(1, used)} onChange={set} /> : null}
      </div>
      {!owner ? (
        <p className="m-0 text-xs text-muted">
          Only the workspace owner can change the seat limit. Ask them if {project.name} needs more seats.
        </p>
      ) : null}
    </Section>
  );
}

function DangerSection({
  workspaceId,
  project,
  onGone,
}: {
  workspaceId: string;
  project: ProjectDetail;
  onGone: () => void;
}) {
  const { data: tasks } = useSuspenseQuery(projectTasksQuery(project.id));
  const archive = useArchiveProject(workspaceId, project.id);
  const remove = useDeleteProject(workspaceId, project.id);
  const [confirming, setConfirming] = useState(false);
  return (
    <Section id="danger" title="Archive or delete" danger>
      {!project.archivedAt ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft pb-3.5">
          <span className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <span className="text-base font-medium">Archive project</span>
            <span className="text-xs text-muted">Hides it from the project switcher. Restore it any time from workspace settings.</span>
          </span>
          <Button
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(undefined, { onSuccess: () => (toast(`Archived ${project.name}`), onGone()) })
            }
          >
            Archive
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-[240px] flex-1 flex-col gap-0.5">
          <span className="text-base font-medium">Delete project</span>
          <span className="text-xs text-muted">
            Removes the project and its {plural(tasks.length, "task")}. You’ll type the key to confirm.
          </span>
        </span>
        <Button onClick={() => setConfirming(true)} className="border-[#FCA5A5] font-semibold text-danger hover:bg-danger-soft">
          Delete…
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${project.name}?`}
        body={`This removes the project and its ${plural(tasks.length, "task")}. You can undo right after.`}
        confirmLabel="Delete project"
        typeToConfirm={project.key}
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => (setConfirming(false), onGone()) })}
      />
    </Section>
  );
}
