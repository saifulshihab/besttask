import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, refreshOnce } from "./api";
import { getTokens, onSessionChange } from "./auth";
import { keys, meQuery } from "./queries";
import { useSelectedProject } from "./selected-project";
import { toast } from "./toast";
import type { ChatMessage, ProjectListItem, UserSummary } from "./types";

/**
 * Live chat for one workspace (H05–H08). The API stores channels only; this
 * module holds messages in memory for as long as the tab is open, so a reload
 * starts empty. One socket per workspace covers all of the user's projects,
 * which is how messages from other projects still raise an unread count and,
 * for direct messages, a toast.
 */

/** A conversation in URLs: a channel's id, or `dm-<userId>` for a direct message. */
export const dmConversation = (userId: string) => `dm-${userId}`;
export const dmPartner = (conversationId: string) =>
  conversationId.startsWith("dm-") ? conversationId.slice(3) : null;
export const conversationKey = (projectId: string, conversationId: string) =>
  `${projectId}/${conversationId}`;

export type MessageStatus = "sending" | "sent" | "failed";
export interface LocalMessage extends ChatMessage {
  status: MessageStatus;
  /** Why a failed message didn't go out. */
  error?: string;
}

/** `closed`: the API refused the connection (signed out, or no longer in the workspace). */
export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "closed";

export interface ChatState {
  status: ConnectionStatus;
  /** By conversation key, oldest first. */
  messages: Record<string, LocalMessage[]>;
  /** Unread messages by conversation key. */
  unread: Record<string, number>;
  /** Who is online, for projects whose list has been asked for. */
  presence: Record<string, string[]>;
}

/** Messages kept per conversation; older ones drop off. */
const KEEP = 500;
const EMPTY: LocalMessage[] = [];

class ChatStore {
  private state: ChatState = { status: "connecting", messages: {}, unread: {}, presence: {} };
  private listeners = new Set<() => void>();
  /** The conversation on screen; its messages don't count as unread. */
  active: string | null = null;
  /** Unsent text per conversation, kept while switching between them. */
  readonly drafts = new Map<string, string>();

  get = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(change: (state: ChatState) => Partial<ChatState>) {
    this.state = { ...this.state, ...change(this.state) };
    this.listeners.forEach((listener) => listener());
  }

  /** Adds a message, or replaces the one it confirms (same id, or own clientId). */
  upsert(key: string, message: LocalMessage) {
    this.update((s) => {
      const list = s.messages[key] ?? EMPTY;
      const index = list.findIndex(
        (m) =>
          m.id === message.id ||
          (message.clientId !== null &&
            m.clientId === message.clientId &&
            m.author.id === message.author.id),
      );
      const next =
        index === -1
          ? [...list, message].slice(-KEEP)
          : list.map((m, i) => (i === index ? { ...message, sentAt: m.sentAt } : m));
      return { messages: { ...s.messages, [key]: next } };
    });
  }

  setActive(key: string | null) {
    this.active = key;
    if (key) this.markRead(key);
  }

  markRead(key: string) {
    if (!this.state.unread[key]) return;
    this.update((s) => {
      const unread = { ...s.unread };
      delete unread[key];
      return { unread };
    });
  }

  bumpUnread(key: string) {
    this.update((s) => ({ unread: { ...s.unread, [key]: (s.unread[key] ?? 0) + 1 } }));
  }

  setPresence(projectId: string, change: (list: string[] | undefined) => string[] | undefined) {
    this.update((s) => {
      const next = change(s.presence[projectId]);
      const presence = { ...s.presence };
      if (next) presence[projectId] = next;
      else delete presence[projectId];
      return { presence };
    });
  }
}

type Ack<T> = { ok: true; data: T } | { ok: false; error: { status: number; message: string } };

interface ChatContextValue {
  store: ChatStore;
  me: UserSummary;
  send: (projectId: string, conversationId: string, body: string) => void;
  retry: (projectId: string, conversationId: string, message: LocalMessage) => void;
  loadPresence: (projectId: string) => void;
  /** Marks the conversation as on screen, or none. */
  setActive: (key: string | null) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat needs a ChatProvider");
  return value;
};

/** Subscribes to part of the chat state. `select` must return stored values, not new objects. */
export function useChatState<T>(select: (state: ChatState) => T): T {
  const { store } = useChat();
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

export const useMessages = (key: string) => useChatState((s) => s.messages[key] ?? EMPTY);

/** Unread messages in one project, across its channels and direct messages. */
export const unreadIn = (unread: Record<string, number>, projectId: string) =>
  Object.entries(unread).reduce((n, [key, count]) => (key.startsWith(`${projectId}/`) ? n + count : n), 0);

/** Who is online in the project (H07), loaded when first asked for and kept live. */
export function usePresence(projectId: string | null) {
  const chat = useChat();
  const status = useChatState((s) => s.status);
  const list = useChatState((s) => (projectId ? s.presence[projectId] : undefined));
  useEffect(() => {
    if (projectId && status === "online") chat.loadPresence(projectId);
  }, [chat, projectId, status]);
  return list;
}

/** The API's origin: the page's own in development (Vite proxies /socket.io). */
const socketOrigin = () =>
  /^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : window.location.origin;

const conversationOf = (message: ChatMessage, meId: string) =>
  message.channelId ??
  dmConversation((message.author.id === meId ? message.recipientId : message.author.id) ?? "");

export function ChatProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const { data: me } = useSuspenseQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [store] = useState(() => new ChatStore());
  const socket = useRef<Socket | null>(null);

  // Read inside socket handlers, which outlive renders.
  const selected = useSelectedProject();
  const latest = useRef({ selectedId: selected?.id, meId: me.id });
  useEffect(() => {
    latest.current = { selectedId: selected?.id, meId: me.id };
  });

  useEffect(() => {
    const s: Socket = io(socketOrigin(), {
      auth: (cb) => cb({ token: getTokens()?.accessToken ?? "", workspaceId }),
      transports: ["websocket", "polling"],
    });
    socket.current = s;
    let lastToken = getTokens()?.accessToken;
    let authRetries = 0;
    let serverDrops = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    s.on("connect", () => {
      authRetries = 0;
      serverDrops = 0;
      store.update(() => ({ status: "online" }));
    });

    s.on("disconnect", (reason) => {
      if (reason === "io client disconnect") return;
      // Presence is re-read once the socket is back.
      store.update(() => ({ status: "reconnecting", presence: {} }));
      // The API closed it: access or the session changed. Try again a few
      // times; if access is really gone, the handshake is refused.
      if (reason === "io server disconnect" && serverDrops < 3) {
        serverDrops += 1;
        retryTimer = setTimeout(() => s.connect(), 1500 * serverDrops);
      }
    });

    s.on("connect_error", (error: Error & { data?: { status?: number } }) => {
      const status = error.data?.status;
      if (status === 401 && authRetries < 2) {
        authRetries += 1;
        void refreshOnce().then((ok) => {
          if (ok) s.connect();
          else store.update(() => ({ status: "closed" }));
        });
        return;
      }
      if (status !== undefined) {
        store.update(() => ({ status: "closed" }));
        return;
      }
      // Network trouble: socket.io keeps retrying on its own.
      store.update(() => ({ status: "reconnecting" }));
    });

    // Refreshing the tokens (here or in another tab) starts a new session;
    // the socket takes it over, or the API would drop it within a minute.
    const stopListening = onSessionChange(() => {
      const token = getTokens()?.accessToken;
      if (!token) {
        s.disconnect();
        store.update(() => ({ status: "closed" }));
        return;
      }
      if (token === lastToken) return;
      lastToken = token;
      if (s.connected) s.emit("session:refresh", { token });
    });

    s.on("message:new", (message: ChatMessage) => {
      const { meId, selectedId } = latest.current;
      const conversationId = conversationOf(message, meId);
      const key = conversationKey(message.projectId, conversationId);
      store.upsert(key, { ...message, status: "sent" });
      if (message.author.id === meId || store.active === key) return;
      store.bumpUnread(key);
      // Channel messages only count as unread; direct messages also toast.
      if (message.channelId) return;
      const projects = qc.getQueryData<ProjectListItem[]>(keys.projects(workspaceId));
      const project = projects?.find((p) => p.id === message.projectId);
      const elsewhere = message.projectId !== selectedId && project;
      toast(elsewhere ? `${message.author.name} in ${project.name}` : message.author.name, {
        id: `chat-${key}`,
        // Long enough to read a message and reach Open.
        duration: 8000,
        description: message.body.length > 140 ? `${message.body.slice(0, 140)}…` : message.body,
        action: {
          label: "Open",
          onClick: () =>
            void navigate({
              to: "/w/$workspaceId/p/$projectId/chat/$conversationId",
              params: { workspaceId, projectId: message.projectId, conversationId },
            }),
        },
      });
    });

    s.on("presence:changed", ({ projectId, userId, online }: { projectId: string; userId: string; online: boolean }) =>
      store.setPresence(projectId, (list) => {
        if (!list) return list;
        if (online) return list.includes(userId) ? list : [...list, userId];
        return list.filter((id) => id !== userId);
      }),
    );

    s.on("channels:changed", ({ projectId }: { projectId: string }) => {
      void qc.invalidateQueries({ queryKey: keys.projectChannels(projectId) });
    });

    // Added to or removed from a project, or one was archived or restored.
    s.on("access:changed", ({ projectIds }: { projectIds: string[] }) => {
      store.update((st) => ({
        presence: Object.fromEntries(Object.entries(st.presence).filter(([id]) => projectIds.includes(id))),
      }));
      void qc.invalidateQueries({ queryKey: keys.projects(workspaceId) });
      // A project page that lost access then shows its "not available" screen.
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "project" && q.queryKey.length === 2,
        refetchType: "active",
      });
    });

    return () => {
      clearTimeout(retryTimer);
      stopListening();
      s.disconnect();
      socket.current = null;
    };
  }, [workspaceId, store, qc, navigate]);

  const value = useMemo<ChatContextValue>(() => {
    const deliver = (key: string, local: LocalMessage) => {
      const s = socket.current;
      if (!s?.connected) {
        store.upsert(key, { ...local, status: "failed", error: "You're offline" });
        return;
      }
      const target = local.recipientId
        ? { projectId: local.projectId, userId: local.recipientId }
        : { channelId: local.channelId };
      s.timeout(10_000).emit(
        "message:send",
        { target, body: local.body, clientId: local.clientId },
        (timeout: Error | null, result?: Ack<ChatMessage>) => {
          if (timeout || !result)
            store.upsert(key, { ...local, status: "failed", error: "No answer from BestTask" });
          else if (!result.ok) store.upsert(key, { ...local, status: "failed", error: result.error.message });
          else store.upsert(key, { ...result.data, status: "sent" });
        },
      );
    };

    return {
      store,
      me: { id: me.id, email: me.email, name: me.name },
      send: (projectId, conversationId, body) => {
        const clientId = crypto.randomUUID();
        const partner = dmPartner(conversationId);
        const local: LocalMessage = {
          id: clientId,
          clientId,
          workspaceId,
          projectId,
          channelId: partner ? null : conversationId,
          recipientId: partner,
          author: { id: me.id, email: me.email, name: me.name },
          body,
          sentAt: new Date().toISOString(),
          status: "sending",
        };
        const key = conversationKey(projectId, conversationId);
        store.upsert(key, local);
        deliver(key, local);
      },
      retry: (projectId, conversationId, message) => {
        const key = conversationKey(projectId, conversationId);
        const local = { ...message, status: "sending" as const, error: undefined };
        store.upsert(key, local);
        deliver(key, local);
      },
      loadPresence: (projectId) => {
        socket.current
          ?.timeout(5000)
          .emit("presence:list", { projectId }, (timeout: Error | null, result?: Ack<{ userIds: string[] }>) => {
            if (!timeout && result?.ok) store.setPresence(projectId, () => result.data.userIds);
          });
      },
      setActive: (key) => store.setActive(key),
    };
  }, [store, me.id, me.email, me.name, workspaceId]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
