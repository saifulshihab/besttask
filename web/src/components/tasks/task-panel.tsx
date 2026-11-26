import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { useInfiniteQuery, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Check,
  Link2,
  Ellipsis,
  Maximize2,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast, toastError } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MenuItem, MenuPopup, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ColorField } from "@/components/ui/color-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { LabelChip, PriorityIcon, StatusDot, UnassignedIcon } from "./task-badges";
import { describe, describeForTask } from "@/lib/activity";
import { cn } from "@/lib/cn";
import { LABEL_COLOR_PRESETS, labelChipColors, nextLabelColor, PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/design";
import { relativeTime } from "@/lib/format";
import { useCreateTask, useMoveTask } from "@/lib/mutations";
import {
  meQuery,
  projectLabelsQuery,
  projectMembersQuery,
  projectTasksQuery,
  taskActivityQuery,
  taskCommentsQuery,
  taskQuery,
} from "@/lib/queries";
import {
  useCreateComment,
  useCreateLabel,
  useDeleteComment,
  useDeleteTask,
  useDuplicateTask,
  useEditComment,
  useTaskLabel,
  useUpdateTask,
  type TaskPatch,
} from "@/lib/task-mutations";
import type { Comment, Label, Priority, ProjectDetail, Task } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";

const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
/** A borderless field inside the properties card; it shows a fill on hover or while open. */
const control =
  "h-9 flex-1 border-transparent bg-transparent px-2 hover:border-transparent hover:bg-hover data-[popup-open]:border-transparent data-[popup-open]:bg-hover";
const propertyLabel = "pl-3 text-sm text-muted";
/** Small uppercase section heading. */
const sectionHeading = "m-0 text-xs font-semibold tracking-[0.05em] text-muted uppercase";
const SAVED_FOR_MS = 60_000;

/**
 * Task detail side panel (prototype "Task detail"). Opens over the board or
 * list from `?task=`; every field saves as soon as it changes.
 */
export function TaskPanel({
  workspaceId,
  project,
  taskId,
  onClose,
}: {
  workspaceId: string;
  project: ProjectDetail;
  taskId: string;
  onClose: () => void;
}) {
  const [full, setFull] = useState(false);
  const tasks = useQuery(projectTasksQuery(project.id));
  const cached = tasks.data?.find((t) => t.id === taskId);
  // Links can point at a task the list has not loaded (or that was deleted).
  const single = useQuery({ ...taskQuery(taskId), enabled: !cached && !tasks.isPending });
  const task = cached ?? single.data;

  return (
    <BaseDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-30 bg-backdrop-soft transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup
          aria-label={task ? `Task ${task.key}` : "Task"}
          className={cn(
            "fixed top-0 right-0 bottom-0 z-30 flex max-w-full flex-col border-l border-raised-edge bg-raised shadow-[-12px_0_32px_rgba(28,25,23,0.18)] outline-none",
            "transition-transform duration-200 data-[ending-style]:translate-x-8 data-[starting-style]:translate-x-8",
            full ? "w-full" : "w-[620px]",
          )}
        >
          {task ? (
            <PanelBody
              key={task.id}
              workspaceId={workspaceId}
              project={project}
              task={task}
              allTasks={tasks.data ?? []}
              full={full}
              onToggleFull={() => setFull((f) => !f)}
              onClose={onClose}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <BaseDialog.Title className="m-0 text-lg font-bold">
                {single.isError ? "This task is no longer available" : "Loading task…"}
              </BaseDialog.Title>
              {single.isError ? (
                <Button onClick={onClose}>Close</Button>
              ) : null}
            </div>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

function PanelBody({
  workspaceId,
  project,
  task,
  allTasks,
  full,
  onToggleFull,
  onClose,
}: {
  workspaceId: string;
  project: ProjectDetail;
  task: Task;
  allTasks: Task[];
  full: boolean;
  onToggleFull: () => void;
  onClose: () => void;
}) {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: people = [] } = useQuery(projectMembersQuery(project.id));
  const { data: labels = [] } = useQuery(projectLabelsQuery(project.id));
  const update = useUpdateTask(workspaceId, project.id);
  const move = useMoveTask(workspaceId, project.id);
  const remove = useDeleteTask(workspaceId, project.id);
  const duplicate = useDuplicateTask(workspaceId, project.id);
  const [savedAt, setSavedAt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = !project.archivedAt;
  const active = people.filter((p) => p.active);
  const subtasks = allTasks.filter((t) => t.parentTaskId === task.id);

  // Hide "Saved" once it is a minute old.
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), SAVED_FOR_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const save = (patch: TaskPatch) =>
    update.mutate({ id: task.id, patch }, { onSuccess: () => setSavedAt(Date.now()) });

  const copy = async () => {
    const text = `${task.key}: ${task.title}`;
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied “${text}”`);
    } catch {
      toast.error("Couldn’t copy to the clipboard");
    }
  };

  const iconButton =
    "flex size-9 items-center justify-center rounded-md border-0 bg-transparent text-ink-2 hover:bg-hover";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line py-2.5 pr-4 pl-5">
        <BaseDialog.Title className="m-0 inline-flex items-center gap-1.5 text-sm font-normal text-muted">
          <span
            className="inline-flex size-4 items-center justify-center rounded-[4px] text-[8px] font-bold text-white"
            style={{ background: project.color }}
          >
            {project.key.slice(0, 2)}
          </span>
          {project.name} <span aria-hidden>/</span>
          <span className="font-semibold text-ink">{task.key}</span>
        </BaseDialog.Title>
        <span className="flex-1" />
        {savedAt ? (
          <span role="status" className="mr-1.5 inline-flex items-center gap-1 text-xs text-success">
            <Check size={13} aria-hidden />
            Saved
          </span>
        ) : null}
        <button type="button" aria-label="Copy task reference" onClick={copy} className={iconButton}>
          <Link2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={full ? "Shrink to side panel" : "Expand to full width"}
          onClick={onToggleFull}
          className={iconButton}
        >
          {full ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        </button>
        {editable ? (
          <MenuRoot>
            <MenuTrigger aria-label="More actions" className={iconButton}>
              <Ellipsis size={16} aria-hidden />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-[190px]">
              <MenuItem
                onClick={() =>
                  duplicate.mutate(task.id, { onSuccess: (copy) => toast(`Duplicated as ${copy.key}`) })
                }
              >
                Duplicate task
              </MenuItem>
              <MenuSeparator />
              <MenuItem tone="danger" onClick={() => setConfirmDelete(true)}>
                Delete task…
              </MenuItem>
            </MenuPopup>
          </MenuRoot>
        ) : null}
        <BaseDialog.Close aria-label="Close panel" className={iconButton}>
          <X size={16} aria-hidden />
        </BaseDialog.Close>
      </div>

      <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-[22px]">
        {project.archivedAt ? (
          <p className="m-0 rounded-md border border-line bg-menu-hover px-3 py-2 text-sm text-ink-2">
            This project is archived. Restore it to edit tasks.
          </p>
        ) : null}
        <TitleField task={task} disabled={!editable} onSave={(title) => save({ title })} />

        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-1 rounded-xl border border-line bg-sidebar p-1">
          <label htmlFor="p-status" className={propertyLabel}>Status</label>
          <Select
            id="p-status"
            size="sm"
            value={task.status}
            disabled={!editable}
            onValueChange={(status) => save({ status })}
            className={control}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUSES[s].name, icon: <StatusDot status={s} /> }))}
          />

          <label htmlFor="p-pri" className={propertyLabel}>Priority</label>
          <Select
            id="p-pri"
            size="sm"
            value={task.priority}
            disabled={!editable}
            onValueChange={(priority) => save({ priority })}
            className={control}
            options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITIES[p].name, icon: <PriorityIcon priority={p} /> }))}
          />

          <label htmlFor="p-asg" className={propertyLabel}>Assignee</label>
          <div className="flex items-center gap-1">
            <Select
              id="p-asg"
              size="sm"
              value={task.assigneeId ?? ""}
              disabled={!editable}
              onValueChange={(id) => save({ assigneeId: id || null })}
              className={control}
              options={[
                { value: "", label: "Unassigned", icon: <UnassignedIcon /> },
                ...active.map((p) => ({
                  value: p.userId,
                  label: p.userId === me.id ? `${p.user.name} (you)` : p.user.name,
                  icon: <Avatar user={p.user} size="xs" />,
                })),
              ]}
            />
            {editable && task.assigneeId !== me.id && active.some((p) => p.userId === me.id) ? (
              <button
                type="button"
                onClick={() => save({ assigneeId: me.id })}
                className="h-8 shrink-0 rounded-md px-2 text-sm font-medium whitespace-nowrap text-accent-hover hover:bg-hover"
              >
                Assign to me
              </button>
            ) : null}
          </div>

          <label htmlFor="p-due" className={propertyLabel}>Due date</label>
          <div className="flex items-center gap-1">
            <DatePicker
              id="p-due"
              size="sm"
              value={task.dueDate?.slice(0, 10) ?? null}
              disabled={!editable}
              placeholder="No due date"
              onChange={(day) => save({ dueDate: day ? `${day}T00:00:00.000Z` : null })}
              className={control}
            />
            {editable && task.dueDate ? (
              <button
                type="button"
                onClick={() => save({ dueDate: null })}
                className="h-8 shrink-0 rounded-md px-2 text-sm text-muted hover:bg-hover"
              >
                Clear
              </button>
            ) : null}
          </div>

          <span className={propertyLabel}>Labels</span>
          <LabelsField
            projectId={project.id}
            task={task}
            labels={labels}
            editable={editable}
            onSaved={() => setSavedAt(Date.now())}
          />
        </div>

        <DescriptionField
          task={task}
          disabled={!editable}
          onSave={(description) => save({ description })}
        />

        <Subtasks
          workspaceId={workspaceId}
          project={project}
          task={task}
          subtasks={subtasks}
          editable={editable}
          onToggle={(sub) => move.mutate({ id: sub.id, status: sub.status === "DONE" ? "TODO" : "DONE" })}
        />

        <Timeline project={project} task={task} meId={me.id} />
      </div>

      {/* Archived projects are read-only, comments included (S15). */}
      {editable ? <CommentComposer projectId={project.id} taskId={task.id} me={me} /> : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${task.key}?`}
        body={`“${task.title}” and its subtasks and comments will be removed. You can undo right after.`}
        confirmLabel="Delete task"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(task, {
            onSuccess: () => {
              setConfirmDelete(false);
              onClose();
            },
          })
        }
      />
    </>
  );
}

/** Large title; saves on blur or Enter, and reverts if left empty. */
function TitleField({
  task,
  disabled,
  onSave,
}: {
  task: Task;
  disabled: boolean;
  onSave: (title: string) => void;
}) {
  const [draft, setDraft] = useState(task.title);
  const [synced, setSynced] = useState(task.title);
  if (task.title !== synced) {
    setSynced(task.title);
    setDraft(task.title);
  }
  const commit = () => {
    const title = draft.trim();
    if (!title) setDraft(task.title);
    else if (title !== task.title) onSave(title);
  };
  return (
    <label className="flex flex-col">
      <span className="sr-only">Title</span>
      <textarea
        rows={2}
        value={draft}
        disabled={disabled}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="-mx-1.5 field-sizing-content resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[24px] leading-[1.3] font-semibold tracking-[-0.01em] text-ink hover:border-line focus:border-accent focus:outline-none disabled:opacity-100"
      />
    </label>
  );
}

function DescriptionField({
  task,
  disabled,
  onSave,
}: {
  task: Task;
  disabled: boolean;
  onSave: (description: string | null) => void;
}) {
  const current = task.description ?? "";
  const [draft, setDraft] = useState(current);
  const [synced, setSynced] = useState(current);
  if (current !== synced) {
    setSynced(current);
    setDraft(current);
  }
  return (
    <label className="flex flex-col gap-2">
      <span className={sectionHeading}>Description</span>
      <textarea
        rows={3}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next !== current.trim()) onSave(next || null);
        }}
        placeholder="Add details, links or acceptance criteria…"
        className="field-sizing-content resize-none max-h-[420px] min-h-19 rounded-lg border border-line bg-transparent px-3.5 py-3 text-base leading-normal text-ink placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function LabelsField({
  projectId,
  task,
  labels,
  editable,
  onSaved,
}: {
  projectId: string;
  task: Task;
  labels: Label[];
  editable: boolean;
  onSaved: () => void;
}) {
  const toggle = useTaskLabel(projectId);
  const create = useCreateLabel(projectId);
  const [query, setQuery] = useState("");
  // null = the automatic next preset; set once the user picks a color.
  const [newColor, setNewColor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const options = labels.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = !!q && !labels.some((l) => l.name.toLowerCase() === q.toLowerCase());
  const has = (id: string) => task.labels.some((l) => l.id === id);

  const set = (label: Label, on: boolean) =>
    toggle.mutate({ taskId: task.id, label, on }, { onSuccess: onSaved });

  const createAndAdd = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canCreate) {
      const match = options[0];
      if (match && !has(match.id)) set(match, true);
      return;
    }
    create.mutate(
      { name: q, color: newColor ?? nextLabelColor(labels) },
      {
        onSuccess: (label) => {
          setQuery("");
          setNewColor(null);
          set(label, true);
          // The Create button disappears; keep focus (and Escape) in the picker.
          inputRef.current?.focus();
        },
        onError: (error) => toastError(error),
      },
    );
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5">
      {task.labels.map((l) => (
        <span
          key={l.id}
          className="inline-flex h-[26px] items-center gap-0.5 rounded-sm pr-0.5 pl-[9px] text-xs font-medium"
          style={labelChipColors(l.color)}
        >
          {l.name}
          {editable ? (
            <button
              type="button"
              aria-label={`Remove label ${l.name}`}
              onClick={() => set(l, false)}
              className="inline-flex size-[22px] items-center justify-center rounded-[4px] text-inherit hover:bg-black/5"
            >
              <X size={11} strokeWidth={2.6} aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <Popover.Root onOpenChange={(open) => !open && (setQuery(""), setNewColor(null))}>
          <Popover.Trigger className="h-[26px] rounded-sm border border-dashed border-line-strong bg-canvas px-[9px] text-xs text-ink-2 hover:bg-hover">
            + Add or create label
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-40">
              <Popover.Popup className="flex max-h-(--available-height) w-[260px] flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-raised p-2 shadow-popover outline-none">
                <form onSubmit={createAndAdd} className="flex">
                  <label className="flex flex-1">
                    <span className="sr-only">Find or create label</span>
                    <input
                      ref={inputRef}
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find or create…"
                      maxLength={40}
                      className="h-8 flex-1 rounded-sm border border-line-strong px-2 text-sm outline-none focus:border-accent"
                    />
                  </label>
                </form>
                <div className="flex max-h-[240px] flex-col overflow-y-auto">
                  {options.map((l) => {
                    const on = has(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        onClick={() => set(l, !on)}
                        className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-menu-hover"
                      >
                        <span
                          className={cn(
                            "box-border flex size-4 items-center justify-center rounded-[4px] border-[1.5px]",
                            on ? "border-accent bg-accent" : "border-faint bg-canvas",
                          )}
                        >
                          {on ? <Check size={11} strokeWidth={3.4} className="text-white" aria-hidden /> : null}
                        </span>
                        <span
                          className="inline-flex h-[22px] items-center rounded-sm px-2 text-xs font-medium"
                          style={labelChipColors(l.color)}
                        >
                          {l.name}
                        </span>
                      </button>
                    );
                  })}
                  {labels.length === 0 && !q ? (
                    <span className="px-2 py-1.5 text-xs text-muted">No labels yet. Type a name to create one.</span>
                  ) : null}
                </div>
                {canCreate ? (
                  <div className="flex flex-col gap-2 border-t border-line-soft px-2 pt-2 pb-1">
                    <span className="text-2xs font-semibold text-muted">Color for “{q}”</span>
                    <ColorField
                      inline
                      size="sm"
                      label={`Color for ${q}`}
                      value={newColor ?? nextLabelColor(labels)}
                      presets={LABEL_COLOR_PRESETS}
                      onChange={setNewColor}
                      preview={(hex) => <LabelChip label={{ name: q, color: hex }} />}
                    />
                  </div>
                ) : null}
                {canCreate ? (
                  <button
                    type="button"
                    disabled={create.isPending}
                    onClick={() => createAndAdd()}
                    className="flex min-h-8 w-full items-center rounded-sm px-2 text-left text-sm font-medium text-accent-hover hover:bg-menu-hover"
                  >
                    + Create “{q}”
                  </button>
                ) : null}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ) : task.labels.length === 0 ? (
        <span className="text-sm text-faint">None</span>
      ) : null}
    </div>
  );
}

function Subtasks({
  workspaceId,
  project,
  task,
  subtasks,
  editable,
  onToggle,
}: {
  workspaceId: string;
  project: ProjectDetail;
  task: Task;
  subtasks: Task[];
  editable: boolean;
  onToggle: (sub: Task) => void;
}) {
  const create = useCreateTask(workspaceId, project.id);
  const remove = useDeleteTask(workspaceId, project.id);
  const [draft, setDraft] = useState("");
  const done = subtasks.filter((s) => s.status === "DONE").length;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    create.mutate(
      { title, status: "TODO", priority: task.priority, assigneeId: null, parentTaskId: task.id },
      { onError: (error) => (setDraft(title), toastError(error)) },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={sectionHeading}>Subtasks</h2>
        <span className="text-xs text-muted">
          {subtasks.length ? `${done} of ${subtasks.length} done` : "None yet"}
        </span>
      </div>
      {subtasks.map((sub) => {
        const closed = sub.status === "DONE";
        return (
          <div key={sub.id} className="group flex min-h-9 items-center gap-2 rounded-sm px-1 hover:bg-row-hover">
            <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-base">
              <Checkbox
                checked={closed}
                disabled={!editable}
                onChange={() => onToggle(sub)}
              />
              <span className={cn(closed ? "text-muted line-through" : "text-ink")}>{sub.title}</span>
            </label>
            {editable ? (
              <button
                type="button"
                aria-label={`Delete subtask ${sub.title}`}
                onClick={() => remove.mutate(sub)}
                className="flex size-7 items-center justify-center rounded-sm text-muted opacity-0 group-hover:opacity-100 hover:bg-hover focus:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <form onSubmit={add} className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2.5 rounded-lg border border-dashed border-line-strong px-3.5 text-muted focus-within:border-accent">
            <Plus size={14} aria-hidden />
            <span className="sr-only">New subtask</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a subtask and press Enter"
              maxLength={200}
              className="flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </label>
        </form>
      ) : null}
    </div>
  );
}

/** Timeline items shown at first and added by each "Load more". */
const TIMELINE_STEP = 15;

function Timeline({
  project,
  task,
  meId,
}: {
  project: ProjectDetail;
  task: Task;
  meId: string;
}) {
  const [tab, setTab] = useState<"all" | "comments">("all");
  // Items shown; "Load more" adds TIMELINE_STEP. Reset when the tab changes.
  const [shown, setShown] = useState({ tab, limit: TIMELINE_STEP });
  if (shown.tab !== tab) setShown({ tab, limit: TIMELINE_STEP });
  const comments = useQuery(taskCommentsQuery(task.id));
  const activity = useInfiniteQuery(taskActivityQuery(task.projectId, task.id));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = activity;

  type Item =
    | { kind: "comment"; at: string; comment: Comment }
    | { kind: "event"; at: string; id: string; actor: string; text: string };

  const items = useMemo<Item[]>(() => {
    const events = activity.data?.pages.flatMap((page) => page.data) ?? [];
    // While older events are still unloaded, a comment older than the oldest
    // loaded event could land out of order; hold it back until they load.
    const oldest = hasNextPage ? events.at(-1)?.createdAt : undefined;
    const list: Item[] = (comments.data ?? [])
      .filter((c) => tab === "comments" || !oldest || c.createdAt >= oldest)
      .map((c) => ({ kind: "comment", at: c.createdAt, comment: c }));
    if (tab === "all") {
      const seen = new Set<string>();
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        for (const entry of describe(event))
          list.push({
            kind: "event",
            at: event.createdAt,
            id: entry.id,
            actor: event.actor?.name.split(" ")[0] ?? "Someone",
            text: describeForTask(entry),
          });
      }
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [comments.data, activity.data, hasNextPage, tab]);

  const visible = items.slice(0, shown.limit);
  const needEvents = tab === "all" && items.length < shown.limit && hasNextPage;
  useEffect(() => {
    if (needEvents && !isFetchingNextPage) void fetchNextPage();
  }, [needEvents, isFetchingNextPage, fetchNextPage]);
  const hasMore = items.length > shown.limit || (tab === "all" && hasNextPage);
  const loadingMore = isFetchingNextPage || needEvents;

  const count = comments.data?.length ?? 0;
  const tabClass = (on: boolean) =>
    cn(
      "h-7 rounded-md border-0 px-2.5 text-xs",
      on ? "bg-canvas font-semibold text-ink shadow-card" : "bg-transparent font-medium text-muted hover:text-ink",
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className={sectionHeading}>Activity</h2>
        <span className="flex-1" />
        <div role="tablist" aria-label="Task timeline" className="flex gap-0.5 rounded-lg bg-hover p-0.5">
        <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} className={tabClass(tab === "all")}>
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "comments"}
          onClick={() => setTab("comments")}
          className={tabClass(tab === "comments")}
        >
          Comments{count ? ` (${count})` : ""}
        </button>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm text-ink-2">
        {visible.map((item) =>
          item.kind === "comment" ? (
            <CommentItem
              key={item.comment.id}
              projectId={project.id}
              taskId={task.id}
              comment={item.comment}
              mine={item.comment.author.id === meId}
              editable={!project.archivedAt}
            />
          ) : (
            <li key={item.id} className="flex items-start gap-2.5">
              <span aria-hidden className="mx-2 my-1.5 size-2 shrink-0 rounded-full bg-faint" />
              <span className="flex-1 leading-normal">
                <b className="font-semibold text-ink">{item.actor}</b> {item.text}
              </span>
              <span className="text-xs whitespace-nowrap text-muted">{relativeTime(item.at)}</span>
            </li>
          ),
        )}
        {items.length === 0 && !comments.isPending && !activity.isPending ? (
          <li className="text-muted">Nothing here yet.</li>
        ) : null}
      </ol>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setShown((s) => ({ ...s, limit: s.limit + TIMELINE_STEP }))}
          disabled={loadingMore}
          className="h-8 self-start rounded-md px-2.5 text-sm font-medium text-accent-hover hover:bg-hover disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

function CommentItem({
  projectId,
  taskId,
  comment,
  mine,
  editable,
}: {
  projectId: string;
  taskId: string;
  comment: Comment;
  mine: boolean;
  editable: boolean;
}) {
  const edit = useEditComment(taskId);
  const remove = useDeleteComment(projectId, taskId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const saveEdit = () => {
    const body = draft.trim();
    if (!body || body === comment.body) return setEditing(false);
    edit.mutate({ id: comment.id, body }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className="flex items-start gap-2.5">
      <Avatar user={comment.author} size="sm" className="mt-0.5" />
      <div className="flex flex-1 flex-col gap-1 rounded-lg bg-sidebar px-3 py-2.5">
        <span className="text-xs text-muted">
          <b className="font-semibold text-ink">{comment.author.name}</b> · {relativeTime(comment.createdAt)}
          {comment.editedAt ? " · edited" : ""}
        </span>
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(false);
                  setDraft(comment.body);
                }
              }}
              className="field-sizing-content resize-none max-h-[260px] min-h-[76px] rounded-md border border-line-strong bg-canvas px-2.5 py-2 text-base outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setDraft(comment.body))}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" disabled={edit.isPending} onClick={saveEdit}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <span className="text-base leading-normal whitespace-pre-wrap text-ink">{comment.body}</span>
        )}
      </div>
      {mine && editable && !editing ? (
        <MenuRoot>
          <MenuTrigger
            aria-label="Comment actions"
            className="flex size-7 items-center justify-center rounded-sm text-muted hover:bg-hover"
          >
            <Ellipsis size={14} aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={() => setEditing(true)}>Edit comment</MenuItem>
            <MenuItem tone="danger" onClick={() => remove.mutate(comment.id)}>
              Delete comment
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
      ) : null}
    </li>
  );
}

function CommentComposer({
  projectId,
  taskId,
  me,
}: {
  projectId: string;
  taskId: string;
  me: { id: string; name: string; email: string; avatar: string | null };
}) {
  const create = useCreateComment(projectId, taskId);
  const [draft, setDraft] = useState("");
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body) return;
    create.mutate(body, { onSuccess: () => setDraft("") });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  };
  return (
    <form
      onSubmit={submit}
      className="mx-4 mb-4 flex items-end gap-2 rounded-xl border border-line-strong bg-sidebar p-1 pl-1.5 focus-within:border-accent"
    >
      <Avatar user={me} className="mb-2 ml-1" />
      <label className="flex flex-1 flex-col">
        <span className="sr-only">Comment</span>
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Leave a comment…"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className="field-sizing-content resize-none max-h-[200px] min-h-11 border-0 bg-transparent px-1.5 py-3 text-base text-ink placeholder:text-faint focus:outline-none"
        />
      </label>
      <Button type="submit" variant="primary" className="h-11 text-sm" disabled={!draft.trim() || create.isPending}>
        Comment
      </Button>
    </form>
  );
}

