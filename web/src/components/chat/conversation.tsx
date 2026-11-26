import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ellipsis, Hash, Info, MessageSquare, SendHorizontal } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { NameDialog } from "@/components/shell/name-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import {
  conversationKey,
  dmPartner,
  useChat,
  useChatState,
  useMessages,
  usePresence,
  type LocalMessage,
} from "@/lib/chat";
import { channelSlug, useDeleteChannel, useRenameChannel } from "@/lib/chat-mutations";
import { cn } from "@/lib/cn";
import { projectChannelsQuery, projectMembersQuery, projectQuery } from "@/lib/queries";
import { useIsMobile } from "@/lib/use-mobile";
import type { Channel } from "@/lib/types";
import { PresenceAvatar } from "./presence-avatar";

/** The API's limit (chat.schema.ts). */
const MAX_LENGTH = 4000;
/** Messages from one person this close together share a heading. */
const GROUP_MS = 5 * 60_000;
const MAX_FACES = 4;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function Conversation({
  workspaceId,
  projectId,
  conversationId,
}: {
  workspaceId: string;
  projectId: string;
  conversationId: string;
}) {
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: channels } = useSuspenseQuery(projectChannelsQuery(projectId));
  const { data: people } = useSuspenseQuery(projectMembersQuery(projectId));
  const chat = useChat();
  const status = useChatState((s) => s.status);
  const key = conversationKey(projectId, conversationId);
  const messages = useMessages(key);
  const archived = !!project.archivedAt;
  const online = usePresence(archived ? null : projectId);
  const mobile = useIsMobile();

  // On screen: arriving messages here don't count as unread.
  useEffect(() => {
    chat.setActive(key);
    return () => chat.setActive(null);
  }, [chat, key]);

  const partnerId = dmPartner(conversationId);
  const channel = partnerId ? undefined : channels.find((c) => c.id === conversationId);
  const partner = partnerId ? people.find((p) => p.userId === partnerId && p.active) : undefined;
  const active = people.filter((p) => p.active);

  // The channel was deleted (here or by someone else): back to the list.
  if (!partnerId && !channel)
    return <Navigate to="/w/$workspaceId/p/$projectId/chat" params={{ workspaceId, projectId }} replace />;

  const partnerOnline = partner && online ? online.includes(partner.userId) : undefined;
  const onlinePeople = online ? active.filter((p) => online.includes(p.userId)) : [];
  const title = channel ? channel.name : (partner?.user.name ?? "Direct message");
  const subtitle = channel
    ? `Everyone on ${project.name}${online ? ` · ${onlinePeople.length} of ${active.length} online` : ""}`
    : partnerOnline === undefined
      ? `Direct message in ${project.name}`
      : `${partnerOnline ? "Online" : "Offline"} · direct message in ${project.name}`;
  const first = partner?.user.name.split(" ")[0] ?? "them";

  return (
    <section aria-label={channel ? `#${title}` : title} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="box-border flex min-h-[76px] flex-wrap items-center gap-3 border-b border-line py-3 pr-7 pl-7 max-md:pr-4 max-md:pl-1">
        {mobile ? (
          <Link
            to="/w/$workspaceId/p/$projectId/chat"
            params={{ workspaceId, projectId }}
            aria-label="All conversations"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink no-underline hover:bg-hover"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 flex min-w-0 items-center gap-2 text-lg font-bold tracking-[-0.01em]">
            {channel ? (
              <Hash size={18} className="shrink-0 text-muted" aria-hidden />
            ) : partner ? (
              <PresenceAvatar user={partner.user} online={partnerOnline} size="md" />
            ) : null}
            <span className="truncate">{title}</span>
          </h2>
          <span className="text-sm text-muted">{subtitle}</span>
        </div>
        {channel && onlinePeople.length ? (
          <div className="flex items-center -space-x-1.5 max-md:hidden">
            {onlinePeople.slice(0, MAX_FACES).map((p) => (
              <Avatar key={p.userId} user={p.user} className="ring-2 ring-canvas" tooltip />
            ))}
          </div>
        ) : null}
        {channel && project.role !== "MEMBER" && !archived ? (
          <ChannelMenu workspaceId={workspaceId} projectId={projectId} channel={channel} channels={channels} />
        ) : null}
      </header>

      {/* Newest at the bottom: column-reverse keeps the view pinned there. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
        <div className="flex flex-col px-7 pt-4 pb-3 max-md:px-4">
          <p className="m-0 mb-3 flex max-w-[560px] items-start gap-2 self-center rounded-lg border border-line bg-row-hover px-3.5 py-2 text-xs leading-normal text-muted">
            <Info size={14} className="mt-px shrink-0" aria-hidden />
            Chat isn’t saved. You see messages sent while you’re signed in, and they’re cleared when you reload
            or sign out.
          </p>
          {messages.length === 0 ? (
            <div className="flex flex-col items-start gap-1.5 py-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-hover">
                <MessageSquare size={20} aria-hidden />
              </span>
              <h3 className="mt-1.5 mb-0 text-lg font-semibold">
                {channel ? `This is the start of #${channel.name}` : `This is the start of your conversation with ${first}`}
              </h3>
              <p className="m-0 text-base text-muted">
                {channel
                  ? `Messages reach everyone on ${project.name} who’s online right now.`
                  : `Messages reach ${first} only while they’re signed in.`}
              </p>
            </div>
          ) : null}
          <ol role="log" aria-label="Messages" className="m-0 flex list-none flex-col p-0">
            {messages.map((m, i) => (
              <MessageRow
                key={m.clientId ?? m.id}
                message={m}
                head={
                  i === 0 ||
                  messages[i - 1]!.author.id !== m.author.id ||
                  Date.parse(m.sentAt) - Date.parse(messages[i - 1]!.sentAt) > GROUP_MS
                }
                onRetry={() => chat.retry(projectId, conversationId, m)}
              />
            ))}
          </ol>
        </div>
      </div>

      <div className="px-7 pt-1 pb-5 max-md:px-3 max-md:pb-3">
        {archived ? (
          <Notice>This project is archived, so its chat is off. It comes back when the project is restored.</Notice>
        ) : status === "closed" ? (
          <Notice>Chat isn’t available right now. Reload the page to reconnect.</Notice>
        ) : partnerId && !partner ? (
          <Notice>This person isn’t on {project.name} anymore.</Notice>
        ) : partner && partnerOnline === false ? (
          <Notice dot>
            <strong className="font-semibold text-ink">{partner.user.name} is offline.</strong> Chat isn’t saved, so
            messages can only reach them while they’re signed in. You can write to them again when they’re back.
          </Notice>
        ) : (
          <>
            {status !== "online" ? (
              <p role="status" className="m-0 mb-2 text-xs text-muted">
                Connecting… You can send once chat is back online.
              </p>
            ) : null}
            <Composer
              key={key}
              chatKey={key}
              placeholder={channel ? `Message #${channel.name}` : `Message ${title}`}
              disabled={status !== "online"}
              enterSends={!mobile}
              onSend={(body) => chat.send(projectId, conversationId, body)}
            />
          </>
        )}
      </div>
    </section>
  );
}

function MessageRow({ message, head, onRetry }: { message: LocalMessage; head: boolean; onRetry: () => void }) {
  const time = timeOf(message.sentAt);
  return (
    <li className={cn("-mx-2 flex gap-2.5 rounded-lg px-2 hover:bg-row-hover", head ? "mt-2.5 py-1" : "py-0.5")}>
      {head ? <Avatar user={message.author} /> : <span className="w-7 shrink-0" aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {head ? (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">{message.author.name}</span>
            <time dateTime={message.sentAt} className="text-2xs text-muted">
              {time}
            </time>
          </div>
        ) : (
          <span className="sr-only">
            {message.author.name}, {time}
          </span>
        )}
        <p
          className={cn(
            "m-0 text-base leading-[1.45] break-words whitespace-pre-wrap",
            message.status === "sent" ? "text-ink-2" : "text-muted",
          )}
        >
          {message.body}
        </p>
        {message.status === "failed" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-danger">Not sent: {message.error}</span>
            <Button size="sm" variant="link" className="h-7 px-2" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Notice({ children, dot = false }: { children: ReactNode; dot?: boolean }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-dashed border-line-strong bg-row-hover px-3.5 py-3 text-sm leading-normal text-ink-2"
    >
      {dot ? <span aria-hidden className="mt-1 box-border size-2.5 shrink-0 rounded-full border-2 border-muted" /> : null}
      <span>{children}</span>
    </div>
  );
}

function Composer({
  chatKey,
  placeholder,
  disabled,
  enterSends,
  onSend,
}: {
  chatKey: string;
  placeholder: string;
  disabled: boolean;
  enterSends: boolean;
  onSend: (body: string) => void;
}) {
  const { store } = useChat();
  const [text, setText] = useState(() => store.drafts.get(chatKey) ?? "");
  const change = (value: string) => {
    setText(value);
    store.drafts.set(chatKey, value);
  };
  const body = text.trim();
  const ready = !disabled && body.length > 0 && body.length <= MAX_LENGTH;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    onSend(body);
    change("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on desktop; Shift+Enter, and Enter while composing
    // (IME input), start a new line.
    if (enterSends && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  const id = `composer-${chatKey}`;
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-line-strong bg-canvas py-2.5 pr-2.5 pl-3.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft"
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <textarea
        id={id}
        rows={2}
        autoFocus={enterSends}
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={MAX_LENGTH}
        className="max-h-40 min-h-11 resize-none border-0 bg-transparent p-0 text-base leading-[1.45] text-ink outline-none placeholder:text-muted"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-muted">
          {body.length > MAX_LENGTH - 200
            ? `${MAX_LENGTH - body.length} characters left`
            : enterSends
              ? "Enter to send · Shift+Enter for a new line"
              : ""}
        </span>
        <Button type="submit" variant="primary" size="sm" disabled={!ready} className="disabled:opacity-50">
          <SendHorizontal size={14} aria-hidden />
          Send
        </Button>
      </div>
    </form>
  );
}

/** Rename and delete for Admins and the owner (H03, H04). */
function ChannelMenu({
  workspaceId,
  projectId,
  channel,
  channels,
}: {
  workspaceId: string;
  projectId: string;
  channel: Channel;
  channels: Channel[];
}) {
  const navigate = useNavigate();
  const rename = useRenameChannel(projectId);
  const remove = useDeleteChannel(projectId);
  const [renaming, setRenaming] = useState(false);
  const fallback = channels.find((c) => c.isDefault && c.id !== channel.id) ?? channels.find((c) => c.id !== channel.id);
  return (
    <>
      <MenuRoot>
        <MenuTrigger
          aria-label="Channel options"
          className="flex size-9 items-center justify-center rounded-md border border-line bg-canvas text-ink-2 hover:bg-hover data-[popup-open]:bg-hover"
        >
          <Ellipsis size={16} aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end" className="w-[240px]">
          <MenuItem onClick={() => setRenaming(true)}>Rename channel</MenuItem>
          {channel.isDefault ? (
            <p className="m-0 px-2.5 pt-1 pb-1.5 text-xs leading-normal text-muted">
              #{channel.name} is the project’s default channel, so it can be renamed but not deleted.
            </p>
          ) : (
            <MenuItem
              tone="danger"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(channel, {
                  onSuccess: () =>
                    void navigate({
                      to: "/w/$workspaceId/p/$projectId/chat/$conversationId",
                      params: { workspaceId, projectId, conversationId: fallback?.id ?? channel.id },
                      replace: true,
                    }),
                })
              }
            >
              Delete channel
            </MenuItem>
          )}
        </MenuPopup>
      </MenuRoot>
      {renaming ? (
        <NameDialog
          open
          onOpenChange={(open) => {
            if (open) return;
            setRenaming(false);
            rename.reset();
          }}
          title="Rename channel"
          label="Channel name"
          initialValue={channel.name}
          submitLabel="Save"
          pending={rename.isPending}
          error={rename.error?.message}
          onSubmit={(value) => {
            const name = channelSlug(value);
            if (!name) return;
            rename.mutate({ id: channel.id, name }, { onSuccess: () => (setRenaming(false), rename.reset()) });
          }}
        />
      ) : null}
    </>
  );
}
