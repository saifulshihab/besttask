import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { describe, type ActivityEntry } from "@/lib/activity";
import { STATUSES, statusPillColors } from "@/lib/design";
import { dayHeading, relativeTime } from "@/lib/format";
import { ACTIVITY_PAGE_SIZE, activityQuery, projectsQuery } from "@/lib/queries";

/** Entries shown at first and added by each "Load more". */
const STEP = ACTIVITY_PAGE_SIZE;

/**
 * Pages through a project's activity for the feed. It shows STEP entries and
 * adds STEP on each loadMore(); one event can describe several entries, so
 * the count is of entries, not events.
 */
export function useActivityFeed(projectId: string) {
  const query = useSuspenseInfiniteQuery(activityQuery(projectId));
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Reset to the first STEP when the project changes (render-time sync).
  const [state, setState] = useState({ projectId, target: STEP });
  if (state.projectId !== projectId) setState({ projectId, target: STEP });

  const entries = useMemo(() => {
    // New events shift offset pages, so an event can arrive twice; keep one.
    const seen = new Set<string>();
    return data.pages
      .flatMap((page) => page.data)
      .filter((e) => !seen.has(e.id) && seen.add(e.id))
      .flatMap(describe);
  }, [data]);

  const short = entries.length < state.target;
  useEffect(() => {
    if (short && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [short, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    entries: entries.slice(0, state.target),
    hasMore: entries.length > state.target || hasNextPage,
    loading: isFetchingNextPage || (short && hasNextPage),
    loadMore: () => setState((s) => ({ ...s, target: s.target + STEP })),
  };
}

/** Day-grouped activity list (prototype Activity screen) with Load more. */
export function ActivityFeed({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const feed = useActivityFeed(projectId);

  const days = useMemo(() => {
    const groups: { day: string; entries: ActivityEntry[] }[] = [];
    for (const entry of feed.entries) {
      const day = dayHeading(entry.event.createdAt);
      const last = groups.at(-1);
      if (last?.day === day) last.entries.push(entry);
      else groups.push({ day, entries: [entry] });
    }
    return groups;
  }, [feed.entries]);

  if (days.length === 0 && feed.loading)
    return <p className="m-0 p-7 text-center text-sm text-muted">Loading activity…</p>;

  if (days.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-line-strong p-7 text-center text-muted">
        <p className="m-0">Nothing has happened here yet.</p>
      </div>
    );

  return (
    <>
      {days.map((group) => (
        <section key={group.day} className="flex flex-col gap-1">
          <h2 className="m-0 mb-1.5 text-xs font-semibold text-muted">{group.day}</h2>
          <ol className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-line p-0">
            {group.entries.map((entry) => {
              const project = projects.find((p) => p.id === entry.event.projectId);
              // Older project events carry no name; fall back to the current one.
              const target =
                entry.target ??
                (entry.event.entityType === "project" ? project?.name : undefined);
              const linkTask =
                entry.taskId && project && !project.archivedAt && entry.type !== "deleted";
              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-line-soft px-4 py-3.5 last:border-b-0"
                >
                  {entry.event.actor ? (
                    <Avatar user={entry.event.actor} />
                  ) : (
                    <span className="size-7 shrink-0 rounded-full bg-menu-hover" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="leading-normal">
                      {entry.event.actor?.name ?? "Someone"} {entry.verb}{" "}
                      {target ? (
                        linkTask ? (
                          <Link
                            to="/w/$workspaceId/p/$projectId/board"
                            params={{ workspaceId, projectId: project.id }}
                            search={{ task: entry.taskId }}
                            className="font-semibold text-ink no-underline hover:underline"
                          >
                            {target}
                          </Link>
                        ) : (
                          <b className="font-semibold">{target}</b>
                        )
                      ) : null}
                      {entry.tail}
                    </span>
                    {entry.pills ? (
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                        {entry.pills.map((status, i) => (
                          <Fragment key={status + i}>
                            {i > 0 ? <span aria-hidden>→</span> : null}
                            <span
                              className="rounded-full px-2 py-0.5"
                              style={statusPillColors(status)}
                            >
                              {STATUSES[status].name}
                            </span>
                          </Fragment>
                        ))}
                      </span>
                    ) : null}
                    {entry.meta || (project && entry.type === "created") ? (
                      <span className="text-xs text-muted">
                        {entry.meta ?? project?.name}
                      </span>
                    ) : null}
                  </div>
                  <time dateTime={entry.event.createdAt} className="text-xs whitespace-nowrap text-muted">
                    {relativeTime(entry.event.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {feed.hasMore ? (
        <div className="flex justify-center pt-1">
          <Button onClick={feed.loadMore} disabled={feed.loading} aria-busy={feed.loading}>
            {feed.loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : days.length > 0 ? (
        <p className="m-0 pt-1 text-center text-xs text-muted">That’s everything.</p>
      ) : null}
    </>
  );
}
