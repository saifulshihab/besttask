import type { Prisma } from "../generated/prisma/client.js";
import { badRequest, forbidden, notFound } from "./errors.js";
import { prisma } from "./prisma.js";
import { atLeast } from "./rbac.js";
import { Role } from "../generated/prisma/enums.js";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Everything authorization needs, loaded in one query (relationJoins): the
 * project, its workspace, the actor's membership in that workspace, and the
 * actor's assignment on this project.
 */
const accessInclude = (actorId: string, projectId: string) =>
  ({
    workspace: {
      include: {
        memberships: {
          where: { userId: actorId },
          include: { projects: { where: { projectId } } },
        },
      },
    },
  }) satisfies Prisma.ProjectInclude;

type ProjectWithAccess = Prisma.ProjectGetPayload<{
  include: ReturnType<typeof accessInclude>;
}>;

const resolveAccess = (
  actorId: string,
  loaded: ProjectWithAccess,
  minimum?: Role,
) => {
  const { workspace: workspaceWithMembers, ...project } = loaded;
  const { memberships, ...workspace } = workspaceWithMembers;
  const found = memberships[0];
  // Same 404 for "not a member" and "no such project", so IDs do not leak.
  if (!found || !found.active || found.deletedAt) throw notFound("Project");
  const { projects: assignments, ...membership } = found;
  const role =
    workspace.ownerId === actorId ? Role.WORKSPACE_OWNER : assignments[0]?.role;
  if (!role) throw notFound("Project");
  if (minimum && !atLeast(role, minimum))
    throw forbidden("Insufficient project permissions");
  if (minimum && project.archivedAt)
    throw badRequest("Restore the archived project before making changes");
  return { project, membership: { ...membership, workspace, role } };
};

export const projectScope = async (
  actorId: string,
  projectId: string,
  minimum?: Role,
  client: Client = prisma,
) => {
  const loaded = await client.project.findUnique({
    where: { id: projectId },
    include: accessInclude(actorId, projectId),
  });
  if (!loaded || loaded.deletedAt) throw notFound("Project");
  return resolveAccess(actorId, loaded, minimum);
};

export const taskScope = async (
  actorId: string,
  taskId: string,
  minimum?: Role,
  client: Client = prisma,
) => {
  // The project id is only known once the task is loaded, so the access
  // include filters assignments through the task's own project relation.
  const loaded = await client.task.findUnique({
    where: { id: taskId },
    include: {
      parentTask: { select: { deletedAt: true } },
      project: {
        include: {
          workspace: {
            include: {
              memberships: {
                where: { userId: actorId },
                include: {
                  projects: {
                    where: { project: { tasks: { some: { id: taskId } } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!loaded || loaded.deletedAt || loaded.parentTask?.deletedAt)
    throw notFound("Task");
  const { project: projectWithAccess, ...task } = loaded;
  if (projectWithAccess.deletedAt) throw notFound("Project");
  const { project, membership } = resolveAccess(
    actorId,
    projectWithAccess,
    minimum,
  );
  return { task, membership, workspaceId: project.workspaceId };
};
