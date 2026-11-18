import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { PageMessage } from "@/components/page-message";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-svh">
      <PageMessage
        title="Page not found"
        body="The link may be old, or the page was moved."
        action={<a href="/">Go to TaskFlow</a>}
      />
    </div>
  ),
});
