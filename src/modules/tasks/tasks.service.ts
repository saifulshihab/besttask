import { recordActivity } from "../../lib/activity.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { paginated, toSkipTake } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { requireMembership, visibleProjects } from "../../lib/rbac.js";
import { projectScope, taskScope } from "../../lib/scope.js";
import type { Actor } from "../../lib/actor.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { scheduleDeletion } from "../../lib/recovery.js";
import { notify, taskFollowers } from "../../lib/notifications.js";
import { Role, TaskStatus } from "../../generated/prisma/enums.js";
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
  MoveTaskInput,
} from "./tasks.schema.js";

const userSelect = { id: true, email: true, name: true } as const;

const taskInclude = {
  assignee: { select: userSelect },
  creator: { select: userSelect },
  project: { select: { id: true, key: true, name: true, workspaceId: true } },
  labels: {
    select: {
      label: { select: { id: true, name: true, color: true, deletedAt: true } },
    },
  },
  _count: {
    select: {
      subtasks: { where: { deletedAt: null } },
      comments: { where: { deletedAt: null } },
    },
  },
} as const;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

// Flatten the join rows so clients see labels, not TaskLabel records.
const present = (task: TaskWithRelations) => ({
  ...task,
  key: task.project.key + "-" + task.number,
  labels: task.labels.map((entry) => entry.label).filter((l) => !l.deletedAt),
});

const assertAssignee = async (
  projectId: string,
  assigneeId: string | null | undefined,
) => {
  if (!assigneeId) return;
  // The workspace owner, or an active user assigned to this project.
  const eligible = await prisma.project.count({
    where: {
      id: projectId,
      OR: [
        { workspace: { ownerId: assigneeId } },
        {
          members: {
            some: {
              membership: { userId: assigneeId, active: true, deletedAt: null },
            },
          },
        },
      ],
    },
  });
  if (!eligible) throw badRequest("Assignee must be an active project user");
};
const assertParent = async (
  projectId: string,
  parentTaskId: string | null | undefined,
) => {
  if (!parentTaskId) return;
  const parent = await prisma.task.findUnique({
    where: { id: parentTaskId },
    select: { id: true, projectId: true, parentTaskId: true, deletedAt: true },
  });
  if (!parent || parent.deletedAt || parent.projectId !== projectId) {
    throw badRequest("Parent task must belong to the same project");
  }
  // One level of nesting keeps lists and completion rules predictable.
  if (parent.parentTaskId) {
    throw badRequest("Subtasks cannot be nested further");
  }
};

const assertLabels = async (projectId: string, labelIds: string[]) => {
  if (labelIds.length === 0) return;
  const found = await prisma.label.count({
    where: { id: { in: labelIds }, projectId, deletedAt: null },
  });
  if (found !== labelIds.length) {
    throw badRequest("One or more labels do not belong to this project");
  }
};

const orderFor = (
  sort: ListTasksQuery["sort"],
): Prisma.TaskOrderByWithRelationInput => {
  const descending = sort.startsWith("-");
  const field = (descending ? sort.slice(1) : sort) as
    "createdAt" | "updatedAt" | "dueDate" | "priority" | "position";
  return { [field]: descending ? "desc" : "asc" };
};

const buildWhere = (
  actor: Actor,
  scope: Prisma.TaskWhereInput,
  query: ListTasksQuery,
): Prisma.TaskWhereInput => {
  const where: Prisma.TaskWhereInput = {
    AND: [scope],
    deletedAt: null,
    OR: [{ parentTaskId: null }, { parentTask: { deletedAt: null } }],
  };

  if (query.status) where.status = { in: query.status };
  if (query.priority) where.priority = { in: query.priority };
  if (query.projectId) where.projectId = query.projectId;
  if (query.parentTaskId) where.parentTaskId = query.parentTaskId;
  if (query.topLevelOnly) where.parentTaskId = null;
  if (query.labelId) where.labels = { some: { labelId: query.labelId } };

  if (query.assigneeId === "me") where.assigneeId = actor.id;
  else if (query.assigneeId === "unassigned") where.assigneeId = null;
  else if (query.assigneeId) where.assigneeId = query.assigneeId;

  if (query.dueBefore || query.dueAfter) {
    where.dueDate = {
      ...(query.dueBefore ? { lte: query.dueBefore } : {}),
      ...(query.dueAfter ? { gte: query.dueAfter } : {}),
    };
  }

  if (query.search) {
    where.AND = [
      scope,
      {
        OR: [
          { title: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
        ],
      },
    ];
  }

  return where;
};

const runList = async (
  actor: Actor,
  scope: Prisma.TaskWhereInput,
  query: ListTasksQuery,
) => {
  const where = buildWhere(actor, scope, query);

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      ...toSkipTake(query),
      orderBy: orderFor(query.sort),
      include: taskInclude,
    }),
    prisma.task.count({ where }),
  ]);

  return paginated(tasks.map(present), total, query);
};

export const create = async (
  actor: Actor,
  projectId: string,
  input: CreateTaskInput,
) => {
  const { project } = await projectScope(actor.id, projectId, Role.MEMBER);
  if (project.archivedAt) throw badRequest("Project is archived");

  const labelIds = input.labelIds ?? [];
  await Promise.all([
    assertAssignee(projectId, input.assigneeId),
    assertParent(projectId, input.parentTaskId),
    assertLabels(projectId, labelIds),
  ]);

  const task = await prisma.$transaction(async (tx) => {
    // Incrementing the sequence locks the project row, so concurrent creates
    // in this project serialize here and cannot read the same max position.
    const sequence = await tx.project.update({
      where: { id: projectId },
      data: { sequence: { increment: 1 } },
    });
    const highest = await tx.task.aggregate({
      where: { projectId },
      _max: { position: true },
    });
    return tx.task.create({
      data: {
        projectId,
        creatorId: actor.id,
        number: sequence.sequence,
        title: input.title,
        status: input.status ?? project.defaultStatus,
        priority: input.priority ?? project.defaultPriority,
        position: (highest._max.position ?? 0) + 1,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.assigneeId === undefined
          ? {}
          : { assigneeId: input.assigneeId }),
        ...(input.parentTaskId === undefined
          ? {}
          : { parentTaskId: input.parentTaskId }),
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
        ...((input.status ?? project.defaultStatus) === TaskStatus.DONE
          ? { completedAt: new Date() }
          : {}),
        ...(labelIds.length > 0
          ? { labels: { create: labelIds.map((labelId) => ({ labelId })) } }
          : {}),
      },
      include: taskInclude,
    });
  });

  await recordActivity({
    projectId,
    workspaceId: project.workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: task.id,
    action: "task.created",
    metadata: { title: task.title, projectId },
  });
  await notify({
    workspaceId: project.workspaceId,
    projectId,
    taskId: task.id,
    actorId: actor.id,
    type: "task.assigned",
    recipients: [task.assigneeId],
    metadata: { title: task.title },
  });

  return present(task);
};

export const listForProject = async (
  actor: Actor,
  projectId: string,
  query: ListTasksQuery,
) => {
  // Authorize and list in parallel; the list is discarded if the scope fails.
  const [, list] = await Promise.all([
    projectScope(actor.id, projectId),
    runList(actor, { projectId }, query),
  ]);
  return list;
};

export const listForWorkspace = async (
  actor: Actor,
  workspaceId: string,
  query: ListTasksQuery,
) => {
  await requireMembership(actor.id, workspaceId);
  return runList(
    actor,
    { project: visibleProjects(actor.id, workspaceId) },
    query,
  );
};

export const get = async (actor: Actor, taskId: string) => {
  // Both run at once; the task is only returned if the scope check passes.
  const [, task] = await Promise.all([
    taskScope(actor.id, taskId),
    prisma.task.findUnique({ where: { id: taskId }, include: taskInclude }),
  ]);
  if (!task) throw notFound("Task");

  return present(task);
};

export const listSubtasks = async (actor: Actor, taskId: string) => {
  const [, subtasks] = await Promise.all([
    taskScope(actor.id, taskId),
    prisma.task.findMany({
      where: { parentTaskId: taskId, deletedAt: null },
      orderBy: { position: "asc" },
      include: taskInclude,
    }),
  ]);
  return subtasks.map(present);
};

export const update = async (
  actor: Actor,
  taskId: string,
  input: UpdateTaskInput,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);
  const changes = changesOf(task, input);

  if (input.assigneeId !== undefined) {
    await assertAssignee(task.projectId, input.assigneeId);
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...input,
      ...completionPatch(task.status, input.status),
      // A new status puts the task at the end of that column.
      ...(input.status !== undefined && input.status !== task.status
        ? { position: await endPosition(task.projectId) }
        : {}),
    },
    include: taskInclude,
  });

  await recordActivity({
    projectId: task.projectId,
    workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    action: "task.updated",
    metadata: {
      title: updated.title,
      fields: Object.keys(input),
      changes,
    },
  });
  await notifyTaskChanges(actor, workspaceId, updated, changes);

  return present(updated);
};

/**
 * Tells a newly assigned user about the assignment, and the task's assignee
 * and creator about a status change. Someone assigned and moved in the same
 * edit hears only about the assignment.
 */
const notifyTaskChanges = async (
  actor: Actor,
  workspaceId: string,
  task: { id: string; projectId: string; title: string; assigneeId: string | null; creatorId: string },
  changes: ReturnType<typeof changesOf>,
) => {
  const base = {
    workspaceId,
    projectId: task.projectId,
    taskId: task.id,
    actorId: actor.id,
  };
  const assignee = changes.assigneeId?.to ?? null;
  if (assignee)
    await notify({
      ...base,
      type: "task.assigned",
      recipients: [assignee],
      metadata: { title: task.title },
    });
  if (changes.status)
    await notify({
      ...base,
      type: "task.status_changed",
      recipients: (await taskFollowers(task)).filter((id) => id !== assignee),
      metadata: { title: task.title, from: changes.status.from, to: changes.status.to },
    });
};

/**
 * Before/after values for the fields the activity feed describes ("changed
 * the priority to High"). Descriptions are long, so only their change is noted.
 */
const changesOf = (
  before: {
    title: string;
    status: TaskStatus;
    priority: string;
    assigneeId: string | null;
    dueDate: Date | null;
  },
  input: UpdateTaskInput,
) => {
  const changes: Record<string, { from: string | null; to: string | null }> =
    {};
  const day = (d: Date | null | undefined) =>
    d ? d.toISOString().slice(0, 10) : null;
  if (input.title !== undefined && input.title !== before.title)
    changes.title = { from: before.title, to: input.title };
  if (input.status !== undefined && input.status !== before.status)
    changes.status = { from: before.status, to: input.status };
  if (input.priority !== undefined && input.priority !== before.priority)
    changes.priority = { from: before.priority, to: input.priority };
  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId)
    changes.assigneeId = { from: before.assigneeId, to: input.assigneeId };
  if (input.dueDate !== undefined && day(input.dueDate) !== day(before.dueDate))
    changes.dueDate = { from: day(before.dueDate), to: day(input.dueDate) };
  return changes;
};

/**
 * completedAt is derived from status rather than accepted from the client, so
 * it cannot drift out of sync with it.
 */
const completionPatch = (
  previous: TaskStatus,
  next: TaskStatus | undefined,
) => {
  if (!next || next === previous) return {};
  if (next === TaskStatus.DONE) return { completedAt: new Date() };
  if (previous === TaskStatus.DONE) return { completedAt: null };
  return {};
};

/** A position after every task in the project: the end of any column. */
const endPosition = async (projectId: string) => {
  const highest = await prisma.task.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  return (highest._max.position ?? 0) + 1;
};

/**
 * Drag and drop. Places the task in `status` before `beforeId` (or last), and
 * renumbers that column so positions stay 1..n. Moving within a column is not
 * recorded as activity; changing column is, as a status change.
 */
export const move = async (
  actor: Actor,
  taskId: string,
  { status, beforeId }: MoveTaskInput,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);

  const order = await prisma.$transaction(async (tx) => {
    // One move per project at a time, so concurrent drags cannot interleave
    // their renumbering.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${task.projectId} FOR UPDATE`;
    // Subtasks are ordered among their siblings; top-level tasks within
    // their board column.
    const column = await tx.task.findMany({
      where: task.parentTaskId
        ? { parentTaskId: task.parentTaskId, deletedAt: null, id: { not: taskId } }
        : { projectId: task.projectId, parentTaskId: null, status, deletedAt: null, id: { not: taskId } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, position: true },
    });
    const at = beforeId ? column.findIndex((t) => t.id === beforeId) : -1;
    const ids = column.map((t) => t.id);
    ids.splice(at === -1 ? ids.length : at, 0, taskId);

    const positions = new Map(column.map((t) => [t.id, t.position]));
    for (const [index, id] of ids.entries()) {
      const position = index + 1;
      if (id === taskId) {
        await tx.task.update({
          where: { id },
          data: {
            position,
            ...(status !== task.status
              ? { status, ...completionPatch(task.status, status) }
              : {}),
          },
        });
      } else if (positions.get(id) !== position) {
        await tx.task.update({ where: { id }, data: { position } });
      }
    }
    return ids.map((id, index) => ({ id, position: index + 1 }));
  });

  if (status !== task.status)
    await recordActivity({
      projectId: task.projectId,
      workspaceId,
      actorId: actor.id,
      entityType: "task",
      entityId: taskId,
      action: "task.status_changed",
      metadata: { title: task.title, from: task.status, to: status },
    });
  if (status !== task.status)
    await notifyTaskChanges(actor, workspaceId, task, {
      status: { from: task.status, to: status },
    });

  const updated = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: taskInclude,
  });
  return { task: present(updated), order };
};

export const setStatus = async (
  actor: Actor,
  taskId: string,
  status: TaskStatus,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);

  // A no-op transition should not show up in the activity feed.
  if (task.status === status) return get(actor, taskId);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      ...completionPatch(task.status, status),
      position: await endPosition(task.projectId),
    },
    include: taskInclude,
  });

  await recordActivity({
    projectId: task.projectId,
    workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    action: "task.status_changed",
    metadata: { title: task.title, from: task.status, to: status },
  });
  await notifyTaskChanges(actor, workspaceId, task, {
    status: { from: task.status, to: status },
  });

  return present(updated);
};

export const setAssignee = async (
  actor: Actor,
  taskId: string,
  assigneeId: string | null,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);
  await assertAssignee(task.projectId, assigneeId);

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { assigneeId },
    include: taskInclude,
  });

  await recordActivity({
    projectId: task.projectId,
    workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    action: assigneeId ? "task.assigned" : "task.unassigned",
    metadata: { title: task.title, from: task.assigneeId, to: assigneeId },
  });
  if (assigneeId !== task.assigneeId)
    await notifyTaskChanges(actor, workspaceId, task, {
      assigneeId: { from: task.assigneeId, to: assigneeId },
    });

  return present(updated);
};

export const attachLabel = async (
  actor: Actor,
  taskId: string,
  labelId: string,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);
  const [label, existing] = await Promise.all([
    prisma.label.findFirst({
      where: { id: labelId, projectId: task.projectId, deletedAt: null },
    }),
    prisma.taskLabel.findUnique({
      where: { taskId_labelId: { taskId, labelId } },
    }),
  ]);
  if (!label)
    throw badRequest("One or more labels do not belong to this project");
  if (existing) throw conflict("Label is already attached to this task");

  await prisma.taskLabel.create({ data: { taskId, labelId } });
  await recordActivity({
    projectId: task.projectId,
    workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    action: "task.label_added",
    metadata: { title: task.title, label: label.name },
  });
  return get(actor, taskId);
};

export const detachLabel = async (
  actor: Actor,
  taskId: string,
  labelId: string,
) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);
  const existing = await prisma.taskLabel.findUnique({
    where: { taskId_labelId: { taskId, labelId } },
    include: { label: { select: { name: true } } },
  });
  if (!existing) throw notFound("Label on this task");

  await prisma.taskLabel.delete({
    where: { taskId_labelId: { taskId, labelId } },
  });
  await recordActivity({
    projectId: task.projectId,
    workspaceId,
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    action: "task.label_removed",
    metadata: { title: task.title, label: existing.label.name },
  });
  return get(actor, taskId);
};

export const remove = async (actor: Actor, taskId: string) => {
  const { task, workspaceId } = await taskScope(actor.id, taskId, Role.MEMBER);

  return scheduleDeletion(actor, workspaceId, "task", taskId, task.projectId, {
    title: task.title,
  });
};

export const duplicate = async (actor: Actor, id: string) => {
  const source = await get(actor, id);
  await projectScope(actor.id, source.projectId, Role.MEMBER);
  const copy = await create(actor, source.projectId, {
    title: source.title + " (copy)",
    description: source.description ?? undefined,
    status: source.status,
    priority: source.priority,
    assigneeId: source.assigneeId,
    dueDate: source.dueDate,
    labelIds: source.labels.map((l) => l.id),
  });
  const subs = await listSubtasks(actor, id);
  for (const sub of subs)
    await create(actor, source.projectId, {
      title: sub.title,
      description: sub.description ?? undefined,
      status: sub.status,
      priority: sub.priority,
      assigneeId: sub.assigneeId,
      dueDate: sub.dueDate,
      parentTaskId: copy.id,
    });
  return copy;
};
