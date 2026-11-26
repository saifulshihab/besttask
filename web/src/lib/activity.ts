import { PRIORITIES, ROLE_LABELS, STATUSES } from "./design";
import { formatDue } from "./task-filters";
import type { ActivityEvent, Priority, Role, TaskStatus } from "./types";

/**
 * Turns API activity events into the prototype's sentences:
 * "{actor} {verb} {target}{tail}", optionally with status pills and a quote.
 * One event can describe several edits (task.updated), so it may expand into
 * several entries.
 */
export interface ActivityEntry {
  id: string;
  event: ActivityEvent;
  verb: string;
  /** Bold name in the sentence: a task, project, label or person. */
  target?: string;
  /** Task this entry links to, when the target is a task. */
  taskId?: string;
  tail?: string;
  /** Status path for moves, e.g. To do → In progress. */
  pills?: TaskStatus[];
  meta?: string;
  /** Feed filter bucket (the owner's "Show" select). */
  type: "created" | "moved" | "edits" | "comment" | "deleted" | "other";
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const isStatus = (v: unknown): v is TaskStatus => typeof v === "string" && v in STATUSES;
const isPriority = (v: unknown): v is Priority => typeof v === "string" && v in PRIORITIES;

export const describe = (event: ActivityEvent): ActivityEntry[] => {
  const m = event.metadata ?? {};
  const person = (id: unknown) => {
    const key = str(id);
    return key ? (event.people[key]?.name ?? "a former member") : undefined;
  };
  const title = str(m.title) ?? str(m.name);
  const isTask = event.entityType === "task";
  const taskId = isTask ? event.entityId : str(m.taskId);
  const base = { event, taskId, target: title };
  const one = (entry: Omit<ActivityEntry, "id" | "event">): ActivityEntry[] => [
    { id: event.id, event, ...entry },
  ];

  switch (event.action) {
    case "task.created":
      return one({ ...base, verb: "created", type: "created" });
    case "task.status_changed":
      return one({
        ...base,
        verb: "moved",
        tail: isStatus(m.to) ? ` to ${STATUSES[m.to].name}` : "",
        pills: isStatus(m.from) && isStatus(m.to) ? [m.from, m.to] : undefined,
        type: "moved",
      });
    case "task.assigned":
      return one({ ...base, verb: "assigned", tail: ` to ${person(m.to)}`, type: "edits" });
    case "task.unassigned":
      return one({ ...base, verb: "unassigned", type: "edits" });
    case "task.label_added":
      return one({ ...base, verb: `added label ${str(m.label) ?? ""} to`, type: "edits" });
    case "task.label_removed":
      return one({ ...base, verb: `removed label ${str(m.label) ?? ""} from`, type: "edits" });
    case "task.updated":
      return describeTaskUpdate(event, base, person);
    case "task.deleted":
      return one({ verb: "deleted", target: title ?? "a task", type: "deleted" });
    case "task.restored":
      return one({ ...base, verb: "restored", type: "other" });
    case "comment.created":
      return one({
        ...base,
        verb: "commented on",
        meta: str(m.excerpt) ? `“${str(m.excerpt)}”` : undefined,
        type: "comment",
      });
    case "comment.updated":
      return one({ ...base, verb: "edited a comment on", type: "comment" });
    case "comment.deleted":
      return one({ ...base, verb: "deleted a comment on", type: "comment" });
    case "project.created":
      return one({ verb: "created the project", target: title, type: "other" });
    case "project.updated":
      return one({ verb: "updated the settings of", target: title ?? "a project", type: "other" });
    case "project.archived":
      return one({ verb: "archived the project", target: title, type: "other" });
    case "project.restored":
      return one({ verb: "restored the project", target: title, type: "other" });
    case "project.deleted":
      return one({ verb: "deleted the project", target: title, type: "deleted" });
    case "project.member_added":
      return one({
        verb: "added",
        target: person(m.userId),
        tail: " to the project",
        meta: str(m.role) ? `as ${ROLE_LABELS[m.role as Role]}` : undefined,
        type: "other",
      });
    case "project.member_role_changed":
      return one({
        verb: "changed the role of",
        target: person(m.userId),
        tail: str(m.role) ? ` to ${ROLE_LABELS[m.role as Role]}` : "",
        type: "other",
      });
    case "project.member_removed":
      return one({ verb: "removed", target: person(m.userId), tail: " from the project", type: "other" });
    case "label.created":
      return one({ verb: "created the label", target: title, type: "other" });
    case "label.updated":
      return one({ verb: "updated the label", target: title, type: "other" });
    case "label.deleted":
      return one({ verb: "deleted the label", target: title, type: "deleted" });
    case "label.restored":
      return one({ verb: "restored the label", target: title, type: "other" });
    case "channel.created":
      return one({ verb: "created the channel", target: title && `#${title}`, type: "other" });
    case "channel.updated": {
      const from = str((m.changes as { name?: { from?: unknown } } | undefined)?.name?.from);
      return one({
        verb: "renamed the channel",
        target: from ? `#${from}` : undefined,
        tail: title ? ` to #${title}` : "",
        type: "other",
      });
    }
    case "channel.deleted":
      return one({ verb: "deleted the channel", target: title && `#${title}`, type: "deleted" });
    case "channel.restored":
      return one({ verb: "restored a deleted channel", type: "other" });
    default:
      return one({ verb: event.action.replace(/[._]/g, " "), type: "other" });
  }
};

function describeTaskUpdate(
  event: ActivityEvent,
  base: { event: ActivityEvent; taskId?: string; target?: string },
  person: (id: unknown) => string | undefined,
): ActivityEntry[] {
  const changes = (event.metadata?.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const entries: ActivityEntry[] = [];
  const add = (key: string, entry: Omit<ActivityEntry, "id" | "event">) =>
    entries.push({ id: `${event.id}-${key}`, event, ...entry });

  const { priority, assigneeId, dueDate, title, status } = changes;
  if (status && isStatus(status.from) && isStatus(status.to))
    add("status", {
      ...base,
      verb: "moved",
      tail: ` to ${STATUSES[status.to].name}`,
      pills: [status.from, status.to],
      type: "moved",
    });
  if (priority && isPriority(priority.to))
    add("priority", {
      ...base,
      verb: "changed the priority of",
      tail: ` to ${PRIORITIES[priority.to].name}`,
      type: "edits",
    });
  if (assigneeId)
    add("assignee", assigneeId.to
      ? { ...base, verb: "assigned", tail: ` to ${person(assigneeId.to)}`, type: "edits" }
      : { ...base, verb: "unassigned", type: "edits" });
  if (dueDate)
    add("due", str(dueDate.to)
      ? { ...base, verb: "set the due date of", tail: ` to ${formatDue(`${dueDate.to}T00:00:00Z`)}`, type: "edits" }
      : { ...base, verb: "cleared the due date of", type: "edits" });
  if (title)
    add("title", { ...base, verb: "renamed", target: str(title.from), tail: ` to “${str(title.to)}”`, type: "edits" });
  const fields = (event.metadata?.fields ?? []) as string[];
  if (fields.includes("description"))
    add("description", { ...base, verb: "edited the description of", type: "edits" });
  // Older events recorded only field names.
  if (entries.length === 0) add("edit", { ...base, verb: "edited", type: "edits" });
  return entries;
}

/** Short form for the task panel timeline: "moved this from To do to Done". */
export const describeForTask = (entry: ActivityEntry) => {
  if (entry.event.action === "task.created") return "created this task";
  if (entry.pills) return `moved this from ${STATUSES[entry.pills[0]!].name} to ${STATUSES[entry.pills[1]!].name}`;
  const verb = entry.verb.replace(/ (of|on|to|from)$/, "");
  if (verb === "renamed") return `renamed this${entry.tail ?? ""}`;
  return `${verb}${entry.tail ?? ""}`;
};
