import { prisma } from "../../lib/prisma.js";
import { taskScope } from "../../lib/scope.js";
import { forbidden, notFound } from "../../lib/errors.js";
import {
  paginated,
  toSkipTake,
  type Pagination,
} from "../../lib/pagination.js";
import { recordActivity } from "../../lib/activity.js";
import { Role } from "../../generated/prisma/enums.js";
import type { Actor } from "../../lib/actor.js";
import type { CreateCommentInput } from "./comments.schema.js";
const select = {
  id: true,
  taskId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  author: { select: { id: true, name: true, email: true } },
} as const;
export const list = async (actor: Actor, taskId: string, p: Pagination) => {
  const where = { taskId, deletedAt: null };
  // Data is discarded if the scope check rejects.
  const [, data, total] = await Promise.all([
    taskScope(actor.id, taskId),
    prisma.comment.findMany({
      where,
      ...toSkipTake(p),
      select,
      orderBy: { createdAt: "asc" },
    }),
    prisma.comment.count({ where }),
  ]);
  return paginated(data, total, p);
};
export const create = async (
  actor: Actor,
  taskId: string,
  input: CreateCommentInput,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);
  const c = await prisma.comment.create({
    data: { taskId, authorId: actor.id, body: input.body },
    select,
  });
  await recordActivity({
    workspaceId,
    projectId: task.projectId,
    actorId: actor.id,
    entityType: "comment",
    entityId: c.id,
    action: "comment.created",
    // The feed quotes the start of the comment, as the redesign shows.
    metadata: { taskId, title: task.title, excerpt: input.body.slice(0, 140) },
  });
  return c;
};
const load = async (actor: Actor, id: string) => {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment || comment.deletedAt) throw notFound("Comment");
  const scope = await taskScope(actor.id, comment.taskId, Role.MEMBER);
  if (comment.authorId !== actor.id)
    throw forbidden("Only the author can change a comment");
  return { comment, scope };
};
export const update = async (actor: Actor, id: string, body: string) => {
  const { comment, scope } = await load(actor, id);
  const updated = await prisma.comment.update({
    where: { id },
    data: { body, editedAt: new Date() },
    select,
  });
  await recordActivity({
    workspaceId: scope.workspaceId,
    projectId: scope.task.projectId,
    actorId: actor.id,
    entityType: "comment",
    entityId: id,
    action: "comment.updated",
    metadata: { taskId: comment.taskId, title: scope.task.title },
  });
  return updated;
};
export const remove = async (actor: Actor, id: string) => {
  const { comment, scope } = await load(actor, id);
  await prisma.comment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await recordActivity({
    workspaceId: scope.workspaceId,
    projectId: scope.task.projectId,
    actorId: actor.id,
    entityType: "comment",
    entityId: id,
    action: "comment.deleted",
    metadata: { taskId: comment.taskId, title: scope.task.title },
  });
};
