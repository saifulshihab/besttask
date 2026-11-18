import { MutationCache, QueryCache, QueryClient, type Query } from "@tanstack/react-query";
import { ApiError } from "./api";

const lostAccess = (error: unknown) =>
  error instanceof ApiError && (error.status === 403 || error.status === 404);

/**
 * A project or workspace the user could open has started answering 403/404:
 * they were removed, deactivated, or it was deleted. Drop the cached copy so
 * the page's error screen ("not available") replaces the stale view, and drop
 * the project from cached sidebar lists so links stop pointing at it.
 */
const onQueryError = (error: unknown, query: Query<unknown, unknown, unknown>) => {
  const [scope, id, ...rest] = query.queryKey as [unknown, unknown, ...unknown[]];
  const root = (scope === "project" || scope === "workspace") && typeof id === "string" && rest.length === 0;
  if (!root || !lostAccess(error) || query.state.data === undefined) return;
  if (scope === "project")
    queryClient.setQueriesData<{ id: string }[]>(
      { predicate: (q) => q.queryKey[0] === "workspace" && q.queryKey[2] === "projects" },
      (list) => list?.filter((p) => p.id !== id),
    );
  else queryClient.setQueryData<{ id: string }[]>(["workspaces"], (list) => list?.filter((w) => w.id !== id));
  void queryClient.resetQueries({ queryKey: [scope, id], exact: true });
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  mutationCache: new MutationCache({
    // An edit refused with 403/404 may mean access was lost; recheck the open
    // project and workspace now rather than on the next window focus.
    onError: (error) => {
      if (!lostAccess(error)) return;
      void queryClient.invalidateQueries({
        predicate: (q) => (q.queryKey[0] === "project" || q.queryKey[0] === "workspace") && q.queryKey.length === 2,
        refetchType: "active",
      });
    },
  }),
  defaultOptions: {
    queries: {
      // Data stays fresh for 30s, so navigating back to a page renders from
      // cache without refetching. Mutations update the cache directly.
      staleTime: 30_000,
      // 4xx responses (no access, not found, validation) will not change on
      // retry; network errors and 5xx get one more try.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 1,
    },
  },
});
