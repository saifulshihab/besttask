import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Hash, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NameDialog } from "@/components/shell/name-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { conversationKey, dmConversation, useChat, useChatState, usePresence } from "@/lib/chat";
import { channelSlug, useCreateChannel } from "@/lib/chat-mutations";
import { cn } from "@/lib/cn";
import { projectChannelsQuery, projectMembersQuery, projectQuery, workspaceQuery } from "@/lib/queries";
import { PresenceAvatar } from "./presence-avatar";

/** The chat screen's own column: the project's channels, then its people. */
export function ChatSidebar({
  workspaceId,
  projectId,
  conversationId,
  className,
}: {
  workspaceId: string;
  projectId: string;
  conversationId: string | null;
  className?: string;
}) {
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: channels } = useSuspenseQuery(projectChannelsQuery(projectId));
  const { data: people } = useSuspenseQuery(projectMembersQuery(projectId));
  const { me } = useChat();
  const unread = useChatState((s) => s.unread);
  const online = usePresence(project.archivedAt ? null : projectId);
  const navigate = useNavigate();
  const create = useCreateChannel(projectId);
  const [creating, setCreating] = useState(false);
  // H02: Admins and the owner; nothing changes in an archived project.
  const canManage = project.role !== "MEMBER" && !project.archivedAt;
  const others = people.filter((p) => p.userId !== me.id && p.active);

  const item = (id: string, label: ReactNode, icon: ReactNode) => {
    const count = unread[conversationKey(projectId, id)] ?? 0;
    const current = id === conversationId;
    return (
      <Link
        key={id}
        to="/w/$workspaceId/p/$projectId/chat/$conversationId"
        params={{ workspaceId, projectId, conversationId: id }}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex h-[34px] items-center gap-2 rounded-[7px] px-2.5 text-base no-underline transition-colors max-md:h-11",
          current
            ? "bg-accent-soft font-semibold text-ink"
            : count
              ? "font-semibold text-ink hover:bg-hover"
              : "text-ink-2 hover:bg-hover",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count ? (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-2xs font-semibold text-white">
            {count > 99 ? "99+" : count}
            <span className="sr-only"> unread</span>
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside aria-label="Chat" className={cn("flex min-h-0 flex-col gap-5 overflow-y-auto bg-canvas px-3 py-[18px]", className)}>
      <div className="flex flex-col gap-0.5 px-2.5">
        <span className="truncate text-xs text-muted">
          {workspace.name} / {project.name}
        </span>
        <h1 className="m-0 text-2xl font-bold tracking-[-0.01em]">Chat</h1>
      </div>

      <section aria-labelledby="chat-channels" className="flex flex-col gap-0.5">
        <div className="flex min-h-7 items-center justify-between pr-1 pb-1 pl-2.5">
          <h2 id="chat-channels" className="m-0 text-xs font-semibold text-muted">
            Channels
          </h2>
          {canManage ? (
            <Tooltip content="New channel">
              <Button variant="ghost" size="icon-xs" aria-label="New channel" onClick={() => setCreating(true)}>
                <Plus size={15} aria-hidden />
              </Button>
            </Tooltip>
          ) : null}
        </div>
        {channels.map((c) => item(c.id, c.name, <Hash size={15} className="shrink-0 text-muted" aria-hidden />))}
      </section>

      <section aria-labelledby="chat-people" className="flex flex-col gap-0.5">
        <h2 id="chat-people" className="m-0 px-2.5 pb-1 text-xs font-semibold text-muted">
          Direct messages
        </h2>
        {others.map((p) => {
          const isOnline = online ? online.includes(p.userId) : undefined;
          return item(
            dmConversation(p.userId),
            <>
              {p.user.name}
              {isOnline === undefined ? null : <span className="sr-only">, {isOnline ? "online" : "offline"}</span>}
            </>,
            <PresenceAvatar user={p.user} online={isOnline} ring={dmConversation(p.userId) === conversationId ? "ring-accent-soft" : "ring-canvas"} />,
          );
        })}
        {others.length === 0 ? (
          <p className="m-0 px-2.5 text-sm text-muted">No one else is on this project yet.</p>
        ) : null}
      </section>

      {creating ? (
        <NameDialog
          open
          onOpenChange={(open) => {
            if (open) return;
            setCreating(false);
            create.reset();
          }}
          title="New channel"
          label="Channel name"
          placeholder="e.g. design-review"
          submitLabel="Create channel"
          pending={create.isPending}
          error={create.error?.message}
          onSubmit={(value) => {
            const name = channelSlug(value);
            if (!name) return;
            create.mutate(name, {
              onSuccess: (channel) => {
                setCreating(false);
                create.reset();
                void navigate({
                  to: "/w/$workspaceId/p/$projectId/chat/$conversationId",
                  params: { workspaceId, projectId, conversationId: channel.id },
                });
              },
            });
          }}
        />
      ) : null}
    </aside>
  );
}
