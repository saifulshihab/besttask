import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

type Scope = "workspace" | "project" | "page";

const copy = (error: unknown, scope: Scope) => {
  const status = error instanceof ApiError ? error.status : -1;
  const thing = scope === "page" ? "page" : scope;
  if (status === 0)
    return {
      title: "Can’t reach TaskFlow",
      body: "Check your connection, then try again. Nothing you saved is lost.",
      retry: true,
    };
  if (status === 403 || status === 404)
    return {
      title: scope === "page" ? "Not available" : `${thing[0]!.toUpperCase()}${thing.slice(1)} not available`,
      body:
        scope === "workspace"
          ? "It may have been deleted, or your access was removed or paused. Ask the workspace owner if you think this is a mistake."
          : scope === "project"
            ? "It may have been deleted, or you’re no longer on this project. Ask a project admin if you think this is a mistake."
            : "This page may have moved, or you no longer have access to it.",
      retry: false,
    };
  return {
    title: `Couldn’t load this ${thing}`,
    body: "Something went wrong on our side. Try again in a moment.",
    retry: true,
    detail: error instanceof Error ? error.message : undefined,
  };
};

/**
 * Error screen for a route: says what happened in plain words, offers Try
 * again for errors that can pass (network, server), and a way back otherwise.
 * Used as the router default, so an inner page's error stays inside the shell.
 */
export function RouteError({ error, reset, scope = "page" }: ErrorComponentProps & { scope?: Scope }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const { title, body, retry, detail } = copy(error, scope);
  const workspaceId = (router.state.matches.at(-1)?.params as { workspaceId?: string } | undefined)?.workspaceId;

  const tryAgain = async () => {
    setRetrying(true);
    // Re-run the loaders (they refetch what failed), then clear the boundary.
    await router.invalidate().catch(() => {});
    reset();
    setRetrying(false);
  };

  return (
    <div role="alert" className="flex flex-1 items-center justify-center px-7 py-12">
      <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
        <h1 className="m-0 text-xl font-bold">{title}</h1>
        <p className="m-0 leading-normal text-muted">{body}</p>
        {detail ? <p className="m-0 text-xs text-faint">{detail}</p> : null}
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {retry ? (
            <Button variant="primary" onClick={() => void tryAgain()} disabled={retrying}>
              {retrying ? "Trying…" : "Try again"}
            </Button>
          ) : null}
          {scope === "workspace" || !workspaceId ? (
            <Button onClick={() => (window.location.href = "/")}>Go to your workspaces</Button>
          ) : (
            <Link
              to="/w/$workspaceId"
              params={{ workspaceId }}
              className="inline-flex h-9 items-center rounded-md border border-line-strong bg-canvas px-3.5 text-sm font-medium text-ink no-underline hover:bg-hover"
            >
              Back to {scope === "project" ? "your projects" : "the workspace"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
