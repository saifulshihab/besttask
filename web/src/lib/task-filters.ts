import { z } from "zod";
import { PRIORITIES } from "./design";
import type { Task } from "./types";

/**
 * Board and list filters live in the URL, so a filtered view can be linked,
 * bookmarked and restored with Back. Defaults are omitted to keep URLs short;
 * malformed values fall back to "no filter" instead of erroring.
 */
const STATUS = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);
const PRIORITY = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]);

export const SORTS = [
  { id: "manual", name: "Manual" },
  { id: "priority", name: "Priority" },
  { id: "newest", name: "Newest" },
  { id: "due", name: "Due date" },
  { id: "title", name: "Title A–Z" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export const taskSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  status: z.array(STATUS).optional().catch(undefined),
  priority: z.array(PRIORITY).optional().catch(undefined),
  /** "me" and/or "none" (unassigned), as in the prototype. */
  assignee: z.array(z.enum(["me", "none"])).optional().catch(undefined),
  label: z.array(z.string()).optional().catch(undefined),
  sort: z.enum(["manual", "priority", "newest", "due", "title"]).optional().catch(undefined),
  /** The task open in the detail panel. */
  task: z.string().optional().catch(undefined),
});
export type TaskSearch = z.infer<typeof taskSearchSchema>;

export const hasFilters = (s: TaskSearch) =>
  !!(s.q?.trim() || s.status?.length || s.priority?.length || s.assignee?.length || s.label?.length);

export const matchesFilters = (task: Task, s: TaskSearch, meId: string) => {
  const q = s.q?.trim().toLowerCase();
  if (q && !`${task.title} ${task.description ?? ""} ${task.key}`.toLowerCase().includes(q))
    return false;
  if (s.status?.length && !s.status.includes(task.status)) return false;
  if (s.priority?.length && !s.priority.includes(task.priority)) return false;
  if (s.assignee?.length) {
    const mine = s.assignee.includes("me") && task.assigneeId === meId;
    const unassigned = s.assignee.includes("none") && !task.assigneeId;
    if (!mine && !unassigned) return false;
  }
  if (s.label?.length && !task.labels.some((l) => s.label!.includes(l.id))) return false;
  return true;
};

const newestFirst = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);

/**
 * Without a chosen sort, tasks follow the board's manual order: drag and drop
 * arranges it, and new tasks join at the end of their column.
 */
export const DEFAULT_SORT: SortId = "manual";

export const sortTasks = (tasks: Task[], sort: SortId = DEFAULT_SORT) =>
  [...tasks].sort((a, b) => {
    if (sort === "manual") return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
    if (sort === "priority")
      return PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank || newestFirst(a, b);
    if (sort === "newest") return newestFirst(a, b);
    // Tasks without a due date sort last.
    if (sort === "due") return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    return a.title.localeCompare(b.title);
  });

/** Local calendar date as YYYY-MM-DD. */
export const todayString = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Due dates are calendar dates stored at UTC midnight; format them in UTC. */
export const formatDue = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const isOverdue = (task: Task, today = todayString()) =>
  !!task.dueDate &&
  task.dueDate.slice(0, 10) < today &&
  task.status !== "DONE" &&
  task.status !== "CANCELLED";

/** Due today or tomorrow and still open (overdue tasks are not "soon"). */
export const isDueSoon = (task: Task, today = todayString()) => {
  if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED") return false;
  const due = task.dueDate.slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(y!, m! - 1, d! + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return due >= today && due <= tomorrow;
};
