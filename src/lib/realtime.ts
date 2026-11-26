import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z, ZodError } from "zod";
import type { Actor } from "./actor.js";
import { AppError, badRequest, notFound, unauthorized } from "./errors.js";
import { logger } from "./logger.js";
import { prisma } from "./prisma.js";
import { visibleProjects } from "./rbac.js";
import { sessionFromToken } from "./session.js";

/**
 * The live connection behind chat. Clients connect with
 * `{ auth: { token, workspaceId } }`; one socket covers every active project
 * the user can open in that workspace.
 *
 * Rooms: `project:<id>` holds everyone who can currently open the project
 * (channel messages, presence and channel-list changes go there) and
 * `member:<workspaceId>:<userId>` holds one person's tabs (direct messages).
 * Services keep rooms in step with access through `realtime.syncWorkspace`
 * after anything that grants or revokes it, and a sweep every minute drops
 * sockets whose session was revoked and re-checks everyone's access.
 *
 * Connections are tracked in this process's memory, so presence and delivery
 * assume a single API instance. Running several needs a socket.io adapter
 * (e.g. @socket.io/postgres-adapter) and sticky sessions.
 */

export interface ChatMessage {
  id: string;
  /** The sender's own id for the message, so its tabs can match the echo. */
  clientId: string | null;
  workspaceId: string;
  projectId: string;
  /** Set for channel messages… */
  channelId: string | null;
  /** …or for a direct message, the person it was sent to. */
  recipientId: string | null;
  author: { id: string; name: string; email: string };
  body: string;
  sentAt: string;
}

export interface SocketErrorPayload {
  status: number;
  code: string;
  message: string;
}

export type AckResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: SocketErrorPayload };

type Ack = (result: AckResult) => void;

export interface ClientEvents {
  "message:send": (payload: unknown, ack: Ack) => void;
  "presence:list": (payload: unknown, ack: Ack) => void;
  "session:refresh": (payload: unknown, ack: Ack) => void;
}

export interface ServerEvents {
  "message:new": (message: ChatMessage) => void;
  "presence:changed": (event: {
    projectId: string;
    userId: string;
    online: boolean;
  }) => void;
  "channels:changed": (event: { projectId: string }) => void;
  "access:changed": (event: { projectIds: string[] }) => void;
}

export interface SocketData {
  actor: Actor;
  sessionId: string;
  workspaceId: string;
  /** Active projects this socket's user can open; its project rooms. */
  projectIds: string[];
}

export type RealtimeSocket = Socket<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketData
>;
type RealtimeServer = Server<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  SocketData
>;

let io: RealtimeServer | null = null;
const live = new Map<string, RealtimeSocket>();

const room = {
  project: (projectId: string) => `project:${projectId}`,
  member: (workspaceId: string, userId: string) =>
    `member:${workspaceId}:${userId}`,
};

const socketsWhere = (match: (data: SocketData) => boolean) =>
  [...live.values()].filter((socket) => match(socket.data));

const tabsOf = (workspaceId: string, userId: string) =>
  socketsWhere((d) => d.workspaceId === workspaceId && d.actor.id === userId);

/**
 * The active (not archived) projects the user can open in the workspace, or
 * null when they are no longer an active member of it.
 */
const accessibleProjects = async (userId: string, workspaceId: string) => {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership || !membership.active || membership.deletedAt) return null;
  const projects = await prisma.project.findMany({
    where: { ...visibleProjects(userId, workspaceId), archivedAt: null },
    select: { id: true },
  });
  return projects.map((p) => p.id);
};

export const errorPayload = (error: unknown): SocketErrorPayload => {
  if (error instanceof AppError)
    return { status: error.statusCode, code: error.code, message: error.message };
  // Same status as an invalid HTTP request (middleware/errorHandler.ts).
  if (error instanceof ZodError)
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Invalid request",
    };
  logger.error({ error }, "Realtime handler failed");
  return { status: 500, code: "INTERNAL", message: "Something went wrong" };
};

/** A socket.io acknowledgement, or a no-op when the client sent none. */
export const ackOf = (ack: unknown): Ack =>
  typeof ack === "function" ? (ack as Ack) : () => undefined;

const announce = (userId: string, projectIds: string[], online: boolean) => {
  for (const projectId of projectIds)
    io?.to(room.project(projectId)).emit("presence:changed", {
      projectId,
      userId,
      online,
    });
};

/**
 * Re-reads access for the given sockets' users, moves sockets between project
 * rooms, tells clients whose projects changed, and disconnects anyone who is
 * no longer an active workspace member.
 */
const resync = async (sockets: RealtimeSocket[]) => {
  const groups = new Map<string, RealtimeSocket[]>();
  for (const socket of sockets) {
    const key = `${socket.data.workspaceId}:${socket.data.actor.id}`;
    groups.set(key, [...(groups.get(key) ?? []), socket]);
  }
  for (const group of groups.values()) {
    const { actor, workspaceId } = group[0]!.data;
    const projectIds = await accessibleProjects(actor.id, workspaceId);
    if (!projectIds) {
      for (const socket of group) socket.disconnect(true);
      continue;
    }
    const after = new Set(projectIds);
    const before = new Set(group.flatMap((s) => s.data.projectIds));
    for (const socket of group) {
      const old = socket.data.projectIds;
      if (old.length === after.size && old.every((p) => after.has(p))) continue;
      for (const p of old) if (!after.has(p)) void socket.leave(room.project(p));
      void socket.join(projectIds.map(room.project));
      socket.data.projectIds = projectIds;
      socket.emit("access:changed", { projectIds });
    }
    announce(actor.id, projectIds.filter((p) => !before.has(p)), true);
    announce(actor.id, [...before].filter((p) => !after.has(p)), false);
  }
};

/** Drops sockets whose session was revoked, then re-checks everyone's access. */
const sweep = async () => {
  const sockets = [...live.values()];
  if (sockets.length === 0) return;
  const ids = [...new Set(sockets.map((s) => s.data.sessionId))];
  const valid = new Set(
    (
      await prisma.refreshToken.findMany({
        where: { id: { in: ids }, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  const kept: RealtimeSocket[] = [];
  for (const socket of sockets)
    if (valid.has(socket.data.sessionId)) kept.push(socket);
    else socket.disconnect(true);
  await resync(kept);
};

/** Runs a realtime update after the request's own work; failures are logged. */
const later = (task: () => Promise<void>) => {
  void task().catch((error) => logger.error({ error }, "Realtime update failed"));
};

const handshakeSchema = z.object({
  token: z.string().min(1, "Missing access token"),
  workspaceId: z.string().min(1, "Missing workspaceId"),
});

export const attachRealtime = (
  server: HttpServer,
  options: { origins: string[]; onConnection: (socket: RealtimeSocket) => void },
) => {
  io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(
    server,
    {
      cors: { origin: options.origins },
      serveClient: false,
      // Chat messages are short text; anything larger is refused.
      maxHttpBufferSize: 64 * 1024,
    },
  );

  io.use(async (socket, next) => {
    try {
      const parsed = handshakeSchema.safeParse(socket.handshake.auth);
      if (!parsed.success)
        throw parsed.error.issues[0]?.path[0] === "token"
          ? unauthorized("Missing access token")
          : badRequest("Missing workspaceId");
      const { actor, sessionId } = await sessionFromToken(parsed.data.token);
      const projectIds = await accessibleProjects(actor.id, parsed.data.workspaceId);
      if (!projectIds) throw notFound("Workspace");
      socket.data = {
        actor,
        sessionId,
        workspaceId: parsed.data.workspaceId,
        projectIds,
      };
      next();
    } catch (error) {
      const payload = errorPayload(error);
      next(Object.assign(new Error(payload.message), { data: payload }));
    }
  });

  io.on("connection", (socket) => {
    const { actor, workspaceId, projectIds } = socket.data;
    const firstTab = tabsOf(workspaceId, actor.id).length === 0;
    live.set(socket.id, socket);
    void socket.join([
      room.member(workspaceId, actor.id),
      ...projectIds.map(room.project),
    ]);
    if (firstTab) announce(actor.id, projectIds, true);

    // Access tokens rotate their session on refresh, so the client hands over
    // each new token; otherwise the sweep would drop the socket.
    socket.on("session:refresh", async (payload, ack) => {
      const reply = ackOf(ack);
      try {
        const { token } = z.object({ token: z.string() }).parse(payload);
        const next = await sessionFromToken(token);
        if (next.actor.id !== socket.data.actor.id)
          throw unauthorized("Session belongs to another account");
        socket.data.sessionId = next.sessionId;
        reply({ ok: true, data: { refreshed: true } });
      } catch (error) {
        reply({ ok: false, error: errorPayload(error) });
      }
    });

    // Who is online in one of this socket's projects.
    socket.on("presence:list", (payload, ack) => {
      const reply = ackOf(ack);
      try {
        const { projectId } = z.object({ projectId: z.string() }).parse(payload);
        if (!socket.data.projectIds.includes(projectId)) throw notFound("Project");
        reply({ ok: true, data: { userIds: realtime.onlineIn(projectId) } });
      } catch (error) {
        reply({ ok: false, error: errorPayload(error) });
      }
    });

    options.onConnection(socket);

    socket.on("disconnect", () => {
      live.delete(socket.id);
      if (tabsOf(workspaceId, actor.id).length === 0)
        announce(actor.id, socket.data.projectIds, false);
    });
  });

  let sweeping = false;
  const timer = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void sweep()
      .catch((error) => logger.error({ error }, "Realtime sweep failed"))
      .finally(() => {
        sweeping = false;
      });
  }, 60_000);
  timer.unref();
  return io;
};

/** Closes every socket, so the HTTP server can finish shutting down. */
export const closeRealtime = () => {
  io?.disconnectSockets(true);
};

/**
 * What services use. Every call is a no-op when no socket server is attached
 * (scripts, or before the server starts listening).
 */
export const realtime = {
  /** Sends to everyone who can currently open the project. */
  toProject(projectId: string, message: ChatMessage) {
    io?.to(room.project(projectId)).emit("message:new", message);
  },

  /** Sends to these people's tabs in the workspace. */
  toMembers(workspaceId: string, userIds: string[], message: ChatMessage) {
    io?.to(userIds.map((id) => room.member(workspaceId, id))).emit(
      "message:new",
      message,
    );
  },

  /** People with a socket that can open the project. */
  onlineIn(projectId: string) {
    return [
      ...new Set(
        socketsWhere((d) => d.projectIds.includes(projectId)).map((s) => s.data.actor.id),
      ),
    ];
  },

  isOnline(workspaceId: string, userId: string, projectId: string) {
    return tabsOf(workspaceId, userId).some((s) =>
      s.data.projectIds.includes(projectId),
    );
  },

  /** A project's channel list changed: clients reload it. */
  channelsChanged(projectId: string) {
    io?.to(room.project(projectId)).emit("channels:changed", { projectId });
  },

  /** Re-checks the access of everyone connected to the workspace. */
  syncWorkspace(workspaceId: string) {
    later(() => resync(socketsWhere((d) => d.workspaceId === workspaceId)));
  },

  /** The workspace was deleted. */
  closeWorkspace(workspaceId: string) {
    for (const socket of socketsWhere((d) => d.workspaceId === workspaceId))
      socket.disconnect(true);
  },

  /** Every session of the user ended (password change, account deletion). */
  dropUser(userId: string) {
    for (const socket of socketsWhere((d) => d.actor.id === userId))
      socket.disconnect(true);
  },

  /** One session ended (sign-out). */
  dropSession(sessionId: string) {
    for (const socket of socketsWhere((d) => d.sessionId === sessionId))
      socket.disconnect(true);
  },
};
