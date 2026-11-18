import { useParams } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast, toastError } from "@/lib/toast";
import { PriorityIcon, StatusDot, UnassignedIcon } from "@/components/tasks/task-badges";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PRIORITIES, STATUSES } from "@/lib/design";
import { useCreateTask } from "@/lib/mutations";
import type { Priority, ProjectDetail, ProjectPerson, TaskStatus } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";

/** Status options for a new task; Cancelled is a terminal state, not a start. */
const NEW_TASK_STATUSES: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export function QuickAddDialog({
  open,
  onOpenChange,
  project,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  people: ProjectPerson[];
}) {
  const { workspaceId } = useParams({ from: "/_app/w/$workspaceId" });
  const create = useCreateTask(workspaceId, project.id);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>(project.defaultStatus);
  const [priority, setPriority] = useState<Priority>(project.defaultPriority);
  const [assigneeId, setAssigneeId] = useState("");
  const [another, setAnother] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setStatus(project.defaultStatus);
    setPriority(project.defaultPriority);
    setAssigneeId("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed, status, priority, assigneeId: assigneeId || null },
      {
        onSuccess: (task) => {
          toast(`Created ${task.key}`);
          reset();
          if (another) titleRef.current?.focus();
          else onOpenChange(false);
        },
        onError: (error) => toastError(error),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={`New task in ${project.name}`}
      width="max-w-[520px]"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-hover"
      >
        <X size={16} aria-hidden />
      </button>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Title">
          <Input
            ref={titleRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="text-md"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Status">
            <Select
              value={status}
              onValueChange={setStatus}
              options={NEW_TASK_STATUSES.map((s) => ({ value: s, label: STATUSES[s].name, icon: <StatusDot status={s} /> }))}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onValueChange={setPriority}
              options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITIES[p].name, icon: <PriorityIcon priority={p} /> }))}
            />
          </Field>
          <Field label="Assignee">
            <Select
              value={assigneeId}
              onValueChange={setAssigneeId}
              options={[
                { value: "", label: "Unassigned", icon: <UnassignedIcon /> },
                ...people
                  .filter((p) => p.active)
                  .map((p) => ({ value: p.userId, label: p.user.name, icon: <Avatar user={p.user} size="xs" /> })),
              ]}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Checkbox
            checked={another}
            onChange={(e) => setAnother(e.target.checked)}
          />
          Create another after this one
        </label>
        <DialogFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            type="submit"
            disabled={!title.trim() || create.isPending}
          >
            Create task
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
