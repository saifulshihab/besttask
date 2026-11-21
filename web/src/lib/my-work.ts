import { dayString } from "./calendar";
import { PRIORITIES } from "./design";
import type { Task } from "./types";

/**
 * My work groups the signed-in user's tasks by when they are due. Open tasks
 * go by due date; finished ones (done or cancelled) have their own group,
 * shown only on request.
 */
export const GROUPS = [
  { id: "overdue", name: "Overdue" },
  { id: "today", name: "Today" },
  { id: "week", name: "Next 7 days" },
  { id: "later", name: "Later" },
  { id: "none", name: "No due date" },
  { id: "finished", name: "Completed" },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];

export const isFinished = (task: Task) => task.status === "DONE" || task.status === "CANCELLED";

/** The day `days` after a YYYY-MM-DD day. */
export const addDays = (day: string, days: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return dayString(new Date(y!, m! - 1, d! + days));
};

export const groupOf = (task: Task, today: string): GroupId => {
  if (isFinished(task)) return "finished";
  if (!task.dueDate) return "none";
  const due = task.dueDate.slice(0, 10);
  if (due < today) return "overdue";
  if (due === today) return "today";
  // "Next 7 days" runs from tomorrow through a week from today.
  return due <= addDays(today, 7) ? "week" : "later";
};

/** Soonest first, then most urgent; finished tasks most recently finished first. */
const compare = (group: GroupId) => (a: Task, b: Task) => {
  if (group === "finished")
    return (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);
  return (
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
    PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank ||
    a.key.localeCompare(b.key, undefined, { numeric: true })
  );
};

/** Non-empty groups in display order, each sorted. */
export const groupTasks = (tasks: Task[], today: string) => {
  const byGroup = new Map<GroupId, Task[]>();
  for (const task of tasks) {
    const id = groupOf(task, today);
    const list = byGroup.get(id);
    if (list) list.push(task);
    else byGroup.set(id, [task]);
  }
  return GROUPS.flatMap((g) => {
    const list = byGroup.get(g.id);
    return list ? [{ ...g, tasks: list.sort(compare(g.id)) }] : [];
  });
};

/** "Today", "Tomorrow", a weekday within the week, otherwise "Dec 4". */
export const dueLabel = (due: string, today: string) => {
  const day = due.slice(0, 10);
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  if (day > today && day <= addDays(today, 6))
    return date.toLocaleDateString("en-US", { weekday: "long" });
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};
