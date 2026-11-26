import { prisma } from "../../lib/prisma.js";
import { paginated, toSkipTake } from "../../lib/pagination.js";
import { projectScope } from "../../lib/scope.js";
import type { Actor } from "../../lib/actor.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ListActivityQuery } from "./activity.schema.js";

/**
 * A project's activity, newest first (A06), or one task's events when
 * `entityId` is given. Every role that can open the project can read it.
 */
export const list = async (
  actor: Actor,
  projectId: string,
  q: ListActivityQuery,
) => {
  await projectScope(actor.id, projectId);
  const where: Prisma.ActivityEventWhereInput = {
    projectId,
    ...(q.entityId ? { entityId: q.entityId } : {}),
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

/** Metadata keys that hold user ids (project member events, assignments). */
const PERSON_KEYS = ["userId", "from", "to"] as const;
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
