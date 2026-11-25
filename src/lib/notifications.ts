import { prisma } from "./prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export type NotificationType =
  "task.assigned" | "task.status_changed" | "comment.created";

export interface NotifyInput {
  workspaceId: string;
  projectId: string;
  taskId: string;
  actorId: string;
  type: NotificationType;
  /** Candidate recipients; duplicates, nulls and the actor are dropped. */
  recipients: (string | null | undefined)[];
  metadata?: Prisma.InputJsonValue;
}

/**
 * Creates one notification per recipient. Nobody is notified about their own
 * action. Access is checked again when notifications are read, so a recipient
 * who has since lost access to the project never sees it.
 */
export const notify = async (
  input: NotifyInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const userIds = [
    ...new Set(
      input.recipients.filter(
        (id): id is string => !!id && id !== input.actorId,
      ),
    ),
  ];
  if (userIds.length === 0) return;
  await client.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      actorId: input.actorId,
      type: input.type,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    })),
  });
};

/**
 * Who hears about a task's status changes and comments: its assignee and its
 * creator, plus (for comments) everyone who has commented on it.
 */
export const taskFollowers = async (
  task: { id: string; assigneeId: string | null; creatorId: string },
  { commenters = false } = {},
) => {
  const ids: (string | null)[] = [task.assigneeId, task.creatorId];
  if (commenters) {
    const authors = await prisma.comment.findMany({
      where: { taskId: task.id, deletedAt: null },
      distinct: ["authorId"],
      select: { authorId: true },
    });
    ids.push(...authors.map((a) => a.authorId));
  }
  return ids;
};
