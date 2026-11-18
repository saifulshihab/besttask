import { prisma } from "../../lib/prisma.js";
import { requireMembership, visibleProjects } from "../../lib/rbac.js";
import { forbidden } from "../../lib/errors.js";
import { paginated, toSkipTake } from "../../lib/pagination.js";
import { Role } from "../../generated/prisma/enums.js";
import type { Actor } from "../../lib/actor.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ListActivityQuery } from "./activity.schema.js";
export const list = async (
  actor: Actor,
  workspaceId: string,
  q: ListActivityQuery,
) => {
  const m = await requireMembership(actor.id, workspaceId);
  const owner = m.role === Role.WORKSPACE_OWNER;
  // Everyone can scope the feed to one of their projects (the project
  // Activity tab, A06) or to one task (the task panel timeline). The
  // filtering controls on workspace activity are owner-only (A08).
  if (!owner && (q.entityType || q.actorId || q.action || q.since))
    throw forbidden("Activity filters are owner-only");
  const projects = owner
    ? []
    : await prisma.project.findMany({
        where: visibleProjects(actor.id, workspaceId),
        select: { id: true },
      });
  const where: Prisma.ActivityEventWhereInput = {
    workspaceId,
    // AND keeps the visibility restriction when a projectId is also given.
    AND: [
      !owner ? { projectId: { in: projects.map((p) => p.id) } } : {},
      q.projectId ? { projectId: q.projectId } : {},
    ],
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.since ? { createdAt: { gte: q.since } } : {}),
  };
  const [events, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      ...toSkipTake(q),
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityEvent.count({ where }),
  ]);
  return paginated(await withPeople(events), total, q);
};

/** Metadata keys that hold user ids (member events, assignments, transfers). */
const PERSON_KEYS = ["userId", "newOwnerId", "from", "to"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adds `people`: names for the user ids an event's metadata mentions, so the
 * feed can say "assigned X to Maya" without a lookup per row. Resolved at read
 * time, so older events gain names too.
 */
const withPeople = async <E extends { metadata: Prisma.JsonValue }>(
  events: E[],
) => {
  const idsOf = (e: E) => {
    const meta =
      e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata)
        ? (e.metadata as Record<string, unknown>)
        : {};
    // Task edits keep the assignee change nested under `changes`.
    const changes = meta.changes as
      Record<string, { from?: unknown; to?: unknown }> | undefined;
    const assignee = changes?.assigneeId;
    return [
      ...PERSON_KEYS.map((k) => meta[k]),
      assignee?.from,
      assignee?.to,
    ].filter((v): v is string => typeof v === "string" && UUID.test(v));
  };
  const ids = [...new Set(events.flatMap(idsOf))];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return events.map((e) => ({
    ...e,
    people: Object.fromEntries(
      idsOf(e).flatMap((id) => {
        const user = byId.get(id);
        return user ? [[id, user]] : [];
      }),
    ),
  }));
};
