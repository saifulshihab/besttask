import { recordActivity } from "../../lib/activity.js";
import { prisma } from "../../lib/prisma.js";
import { requireMembership, visibleProjects } from "../../lib/rbac.js";
import { projectScope } from "../../lib/scope.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { paginated, toSkipTake } from "../../lib/pagination.js";
import { realtime } from "../../lib/realtime.js";
import { scheduleDeletion } from "../../lib/recovery.js";
import { Role, TaskStatus } from "../../generated/prisma/enums.js";
import type { Actor } from "../../lib/actor.js";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "./projects.schema.js";

/**
 * Word initials, as the redesign shows them: "Photo Payload" -> "PP",
 * "Mobile App" -> "MA". A single word uses its first two letters.
 */
const baseKey = (name: string) => {
  const words = name.toUpperCase().match(/[A-Z][A-Z0-9]*/g) ?? [];
  if (words.length === 0) return "PRJ";
  if (words.length === 1) return words[0]!.slice(0, 2);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
};

/** Keys are unique per workspace; on a clash append 2, 3, … (max 5 chars). */
const availableKey = async (workspaceId: string, name: string) => {
  const base = baseKey(name);
  const taken = new Set(
    (
      await prisma.project.findMany({
        where: { workspaceId, key: { startsWith: base } },
        select: { key: true },
      })
    ).map((p) => p.key),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = base.slice(0, 5 - String(n).length) + n;
    if (!taken.has(candidate)) return candidate;
  }
  throw conflict("Choose a project key");
};

export const create = async (
  actor: Actor,
  workspaceId: string,
  input: CreateProjectInput,
) => {
  await requireMembership(actor.id, workspaceId, Role.WORKSPACE_OWNER);
  const key = input.key || (await availableKey(workspaceId, input.name));
  // Every project starts with its default chat channel (H01).
  const project = await prisma.project.create({
    data: {
      ...input,
      key,
      workspaceId,
      channels: { create: { name: "general", isDefault: true } },
    },
  });
  await recordActivity({
    workspaceId,
    projectId: project.id,
    actorId: actor.id,
    entityType: "project",
    entityId: project.id,
    action: "project.created",
    metadata: { name: project.name },
  });
  realtime.syncWorkspace(workspaceId);
  return project;
};
export const list = async (
  actor: Actor,
  workspaceId: string,
  q: ListProjectsQuery,
) => {
  const where = {
    AND: [
      visibleProjects(actor.id, workspaceId),
      ...(q.search
        ? [
            {
              OR: [
                { name: { contains: q.search, mode: "insensitive" as const } },
                { key: { contains: q.search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
    ...(q.includeArchived ? {} : { archivedAt: null }),
    ...(q.status ? { status: q.status } : {}),
  };
  // The membership check runs alongside the queries; their results are
  // discarded if it rejects.
  const [m, data, total] = await Promise.all([
    requireMembership(actor.id, workspaceId),
    prisma.project.findMany({
      where,
      ...toSkipTake(q),
      include: {
        members: {
          where: { membership: { userId: actor.id } },
          select: { role: true },
        },
        _count: {
          select: {
            // Open top-level work only: the sidebar count the redesign shows
            // per project. Subtasks show as progress on their parent instead.
            tasks: {
              where: {
                deletedAt: null,
                parentTaskId: null,
                status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
              },
            },
            members: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.count({ where }),
  ]);
  return paginated(
    data.map((p) => ({
      ...p,
      role: m.role === Role.WORKSPACE_OWNER ? m.role : p.members[0]?.role,
    })),
    total,
    q,
  );
};
export const get = async (actor: Actor, projectId: string) => {
  const [{ project, membership }, used] = await Promise.all([
    projectScope(actor.id, projectId),
    prisma.projectMembership.count({ where: { projectId } }),
  ]);
  return { ...project, role: membership.role, seatsUsed: used };
};
export const update = async (
  actor: Actor,
  projectId: string,
  input: UpdateProjectInput,
) => {
  const { project, membership } = await projectScope(
    actor.id,
    projectId,
    Role.ADMIN,
  );
  if (input.seats !== undefined && membership.role !== Role.WORKSPACE_OWNER)
    throw badRequest("Only the workspace owner can change seat limits");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${project.workspaceId} FOR UPDATE`;
    await projectScope(
      actor.id,
      projectId,
      input.seats !== undefined ? Role.WORKSPACE_OWNER : Role.ADMIN,
      tx,
    );
    if (input.seats !== undefined) {
      const count = await tx.projectMembership.count({ where: { projectId } });
      if (input.seats < count)
        throw conflict("Remove people before reducing the seat limit");
    }
    const updated = await tx.project.update({
      where: { id: projectId },
      data: input,
    });
    await recordActivity(
      {
        workspaceId: project.workspaceId,
        projectId,
        actorId: actor.id,
        entityType: "project",
        entityId: projectId,
        action: "project.updated",
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );
    return updated;
  });
};
export const setArchived = async (
  actor: Actor,
  projectId: string,
  archived: boolean,
) => {
  const { project } = await projectScope(actor.id, projectId);
  await requireMembership(actor.id, project.workspaceId, Role.WORKSPACE_OWNER);
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt: archived ? new Date() : null },
  });
  await recordActivity({
    workspaceId: project.workspaceId,
    projectId,
    actorId: actor.id,
    entityType: "project",
    entityId: projectId,
    action: archived ? "project.archived" : "project.restored",
  });
  // Archived projects have no live chat; restoring brings it back.
  realtime.syncWorkspace(project.workspaceId);
  return updated;
};
export const remove = async (actor: Actor, projectId: string) => {
  const { project } = await projectScope(
    actor.id,
    projectId,
    Role.WORKSPACE_OWNER,
  );
  return scheduleDeletion(
    actor,
    project.workspaceId,
    "project",
    projectId,
    projectId,
    { name: project.name },
  );
};
export const members = async (actor: Actor, projectId: string) => {
  // Scope, owner and assignments load in parallel; results are discarded if
  // the scope check rejects.
  const [, ws, rows] = await Promise.all([
    projectScope(actor.id, projectId),
    // findFirst, not OrThrow, so a missing project fails through the scope
    // check's 404 instead of racing it with a different error.
    prisma.workspace.findFirst({
      where: { projects: { some: { id: projectId } } },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
      },
    }),
    prisma.projectMembership.findMany({
      where: { projectId, membership: { deletedAt: null } },
      include: {
        membership: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
        },
      },
    }),
  ]);
  if (!ws) throw notFound("Project");
  return [
    {
      id: ws.ownerId,
      userId: ws.ownerId,
      role: Role.WORKSPACE_OWNER,
      active: true,
      user: ws.owner,
    },
    ...rows.map((r) => ({
      id: r.membershipId,
      userId: r.membership.userId,
      role: r.role,
      active: r.membership.active,
      user: r.membership.user,
    })),
  ];
};
export const candidates = async (actor: Actor, projectId: string) => {
  const { project, membership } = await projectScope(
    actor.id,
    projectId,
    Role.ADMIN,
  );
  return prisma.membership.findMany({
    where: {
      workspaceId: project.workspaceId,
      active: true,
      deletedAt: null,
      userId: { not: membership.workspace.ownerId },
      NOT: { projects: { some: { projectId } } },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
};
export const setMember = async (
  actor: Actor,
  projectId: string,
  userId: string,
  role: Role | null,
) => {
  if (role === "WORKSPACE_OWNER")
    throw badRequest("Ownership is managed at workspace scope");
  const { project, membership } = await projectScope(
    actor.id,
    projectId,
    Role.ADMIN,
  );
  if (userId === actor.id && membership.role !== Role.WORKSPACE_OWNER)
    throw badRequest("Admins cannot remove or change their own role");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${project.workspaceId} FOR UPDATE`;
    await projectScope(actor.id, projectId, Role.ADMIN, tx);
    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id: project.workspaceId },
    });
    if (userId === actor.id && ws.ownerId !== actor.id)
      throw badRequest("Admins cannot remove or change their own role");
    if (ws.ownerId === userId)
      throw badRequest("The owner has inherent project access");
    const target = await tx.membership.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId: project.workspaceId },
      },
    });
    if (!target || target.deletedAt || !target.active)
      throw badRequest("Choose an active workspace user");
    const where = {
      projectId_membershipId: { projectId, membershipId: target.id },
    };
    const existing = await tx.projectMembership.findUnique({ where });
    if (!role) {
      if (!existing) throw notFound("Project membership");
      await tx.projectMembership.delete({ where });
      await tx.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null },
      });
      await recordActivity(
        {
          workspaceId: project.workspaceId,
          projectId,
          actorId: actor.id,
          entityType: "membership",
          entityId: target.id,
          action: "project.member_removed",
          metadata: { userId },
        },
        tx,
      );
      return { removed: true };
    }
    if (!existing) {
      const used = await tx.projectMembership.count({ where: { projectId } });
      const current = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
      });
      if (used >= current.seats) throw conflict("Project seat limit reached");
    }
    const assignment = await tx.projectMembership.upsert({
      where,
      create: { projectId, membershipId: target.id, role },
      update: { role },
    });
    await recordActivity(
      {
        workspaceId: project.workspaceId,
        projectId,
        actorId: actor.id,
        entityType: "membership",
        entityId: target.id,
        action: existing
          ? "project.member_role_changed"
          : "project.member_added",
        metadata: { userId, role },
      },
      tx,
    );
    return assignment;
  });
  realtime.syncWorkspace(project.workspaceId);
  return result;
};
