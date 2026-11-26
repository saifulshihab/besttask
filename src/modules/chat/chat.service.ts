import { randomUUID } from "node:crypto";
import { recordActivity } from "../../lib/activity.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { realtime, type ChatMessage } from "../../lib/realtime.js";
import { scheduleDeletion } from "../../lib/recovery.js";
import { projectScope } from "../../lib/scope.js";
import { Role } from "../../generated/prisma/enums.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Actor } from "../../lib/actor.js";
import type { ChannelInput, SendMessageInput } from "./chat.schema.js";

/** Channels per project, counting the default one. */
export const MAX_CHANNELS = 50;

type Client = Prisma.TransactionClient | typeof prisma;

/** Every role on the project reads the list (H01). */
export const list = async (actor: Actor, projectId: string) => {
  await projectScope(actor.id, projectId);
  return prisma.channel.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
};

/** Names are unique per project, including a channel waiting out its Undo. */
const ensureNameFree = async (
  client: Client,
  projectId: string,
  name: string,
  exceptId?: string,
) => {
  const clash = await client.channel.findFirst({
    where: { projectId, name, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (clash)
    throw conflict(
      clash.deletedAt
        ? `#${name} was just deleted. Undo it, or wait a few seconds`
        : `#${name} already exists in this project`,
    );
};

export const create = async (
  actor: Actor,
  projectId: string,
  input: ChannelInput,
) => {
  const { project } = await projectScope(actor.id, projectId, Role.ADMIN);
  const channel = await prisma.$transaction(async (tx) => {
    // Serialises creates in a project, so the limit and name checks hold.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    await projectScope(actor.id, projectId, Role.ADMIN, tx);
    const count = await tx.channel.count({ where: { projectId, deletedAt: null } });
    if (count >= MAX_CHANNELS)
      throw conflict(`A project can have up to ${MAX_CHANNELS} channels`);
    await ensureNameFree(tx, projectId, input.name);
    const created = await tx.channel.create({
      data: { projectId, name: input.name },
    });
    await recordActivity(
      {
        workspaceId: project.workspaceId,
        projectId,
        actorId: actor.id,
        entityType: "channel",
        entityId: created.id,
        action: "channel.created",
        metadata: { name: created.name },
      },
      tx,
    );
    return created;
  });
  realtime.channelsChanged(projectId);
  return channel;
};

/** Changes need an Admin of the channel's project or the owner (H02–H04). */
const loadForChange = async (actor: Actor, channelId: string) => {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt) throw notFound("Channel");
  const { project } = await projectScope(actor.id, channel.projectId, Role.ADMIN);
  return { channel, project };
};

export const rename = async (
  actor: Actor,
  channelId: string,
  input: ChannelInput,
) => {
  const { channel, project } = await loadForChange(actor, channelId);
  if (channel.name === input.name) return channel;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${channel.projectId} FOR UPDATE`;
    await ensureNameFree(tx, channel.projectId, input.name, channel.id);
    const renamed = await tx.channel.update({
      where: { id: channel.id },
      data: { name: input.name },
    });
    await recordActivity(
      {
        workspaceId: project.workspaceId,
        projectId: channel.projectId,
        actorId: actor.id,
        entityType: "channel",
        entityId: channel.id,
        action: "channel.updated",
        metadata: {
          name: renamed.name,
          changes: { name: { from: channel.name, to: renamed.name } },
        },
      },
      tx,
    );
    return renamed;
  });
  realtime.channelsChanged(channel.projectId);
  return updated;
};

/** Six-second Undo, like every other delete. #general always stays. */
export const remove = async (actor: Actor, channelId: string) => {
  const { channel, project } = await loadForChange(actor, channelId);
  if (channel.isDefault)
    throw badRequest(`#${channel.name} is the project's default channel and can't be deleted`);
  return scheduleDeletion(
    actor,
    project.workspaceId,
    "channel",
    channel.id,
    channel.projectId,
    { name: channel.name },
  );
};

const authorOf = (actor: Actor) =>
  prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { id: true, name: true, email: true },
  });

/**
 * Relays one message to whoever is online right now. Nothing is stored: a
 * message reaches only the sockets connected when it is sent (H05–H07).
 * Access is checked on every message, and archived projects take none.
 */
export const sendMessage = async (
  actor: Actor,
  workspaceId: string,
  input: SendMessageInput,
): Promise<ChatMessage> => {
  const base = {
    id: randomUUID(),
    clientId: input.clientId ?? null,
    workspaceId,
    body: input.body,
    sentAt: new Date().toISOString(),
  };

  if ("channelId" in input.target) {
    const channel = await prisma.channel.findUnique({
      where: { id: input.target.channelId },
    });
    if (!channel || channel.deletedAt) throw notFound("Channel");
    const [{ project }, author] = await Promise.all([
      projectScope(actor.id, channel.projectId, Role.MEMBER),
      authorOf(actor),
    ]);
    // A socket speaks for one workspace only.
    if (project.workspaceId !== workspaceId) throw notFound("Channel");
    const message: ChatMessage = {
      ...base,
      projectId: project.id,
      channelId: channel.id,
      recipientId: null,
      author,
    };
    realtime.toProject(project.id, message);
    return message;
  }

  const { projectId, userId } = input.target;
  if (userId === actor.id) throw badRequest("Choose someone else to message");
  const [{ project }, author] = await Promise.all([
    projectScope(actor.id, projectId, Role.MEMBER),
    authorOf(actor),
  ]);
  if (project.workspaceId !== workspaceId) throw notFound("Project");
  // The recipient must be able to open the same project (H06).
  await projectScope(userId, projectId).catch(() => {
    throw notFound("Person");
  });
  if (!realtime.isOnline(workspaceId, userId, projectId))
    throw conflict("They're offline. Messages can only reach people who are signed in");
  const message: ChatMessage = {
    ...base,
    projectId,
    channelId: null,
    recipientId: userId,
    author,
  };
  realtime.toMembers(workspaceId, [actor.id, userId], message);
  return message;
};
