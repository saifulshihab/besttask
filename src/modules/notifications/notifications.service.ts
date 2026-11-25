import { notFound } from "../../lib/errors.js";
import { paginated, toSkipTake } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { requireMembership, visibleProjects } from "../../lib/rbac.js";
import { TaskStatus } from "../../generated/prisma/enums.js";
import type { Actor } from "../../lib/actor.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ListNotificationsQuery } from "./notifications.schema.js";

const include = {
  actor: { select: { id: true, name: true, email: true, avatar: true } },
  task: {
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      projectId: true,
      project: { select: { key: true, name: true, color: true } },
    },
  },
} as const;

type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: typeof include;
}>;

const present = ({ task, ...n }: NotificationWithRelations) => ({
  ...n,
  task: { ...task, key: `${task.project.key}-${task.number}` },
});

/**
 * The actor's own notifications in a workspace, for tasks that still exist in
 * projects the actor can still open. Checked on every read rather than when
 * notifications are created, so removal from a project hides them at once.
 */
const visible = (
  actorId: string,
  workspaceId: string,
): Prisma.NotificationWhereInput => ({
  userId: actorId,
  workspaceId,
  task: {
    deletedAt: null,
    OR: [{ parentTaskId: null }, { parentTask: { deletedAt: null } }],
    project: visibleProjects(actorId, workspaceId),
  },
});

export const list = async (
  actor: Actor,
  workspaceId: string,
  q: ListNotificationsQuery,
) => {
  await requireMembership(actor.id, workspaceId);
  const where: Prisma.NotificationWhereInput = {
    ...visible(actor.id, workspaceId),
    ...(q.unread ? { readAt: null } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(q),
    }),
    prisma.notification.count({ where }),
  ]);
  return paginated(rows.map(present), total, q);
};

/** Today's date (YYYY-MM-DD) in the user's timezone, or UTC if it is unknown. */
const todayIn = (timezone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/**
 * The bell's numbers: unread notifications, and the actor's open tasks that
 * are overdue or due today. Due dates are calendar days stored at UTC
 * midnight, compared with today in the actor's own timezone.
 */
export const summary = async (actor: Actor, workspaceId: string) => {
  await requireMembership(actor.id, workspaceId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { timezone: true },
  });
  const today = new Date(`${todayIn(user.timezone)}T00:00:00.000Z`);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const mine: Prisma.TaskWhereInput = {
    assigneeId: actor.id,
    deletedAt: null,
    status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
    project: { ...visibleProjects(actor.id, workspaceId), archivedAt: null },
  };
  const [unread, overdue, dueToday] = await Promise.all([
    prisma.notification.count({
      where: { ...visible(actor.id, workspaceId), readAt: null },
    }),
    prisma.task.count({ where: { ...mine, dueDate: { lt: today } } }),
    prisma.task.count({
      where: { ...mine, dueDate: { gte: today, lt: tomorrow } },
    }),
  ]);
  return { unread, overdue, dueToday };
};

export const mark = async (actor: Actor, id: string, read: boolean) => {
  // Someone else's notification answers 404, the same as a missing one.
  const existing = await prisma.notification.findFirst({
    where: { id, userId: actor.id },
    select: { id: true },
  });
  if (!existing) throw notFound("Notification");
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: read ? new Date() : null },
    include,
  });
  return present(updated);
};

export const markAllRead = async (actor: Actor, workspaceId: string) => {
  await requireMembership(actor.id, workspaceId);
  const { count } = await prisma.notification.updateMany({
    where: { ...visible(actor.id, workspaceId), readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
};
