import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouteError } from "@/components/route-error";
import { hasSession, onSessionChange } from "@/lib/auth";
import { queryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const router = createRouter({
  routeTree,
  context: { queryClient },
  // Hovering or focusing a link runs the target route's loader, so the data
  // is usually cached before the click lands.
  defaultPreload: "intent",
  // Freshness is TanStack Query's job; the router always asks it.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  // Every route gets a recoverable error screen, so a failing page keeps the
  // shell (sidebar, header) around it instead of taking over the window.
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Sign-out, a failed token refresh, or a sign-in/out in another tab.
onSessionChange(() => {
  if (hasSession()) {
    void router.invalidate();
    return;
  }
  const { pathname, href } = router.state.location;
  const onAuthPage = pathname === "/login" || pathname === "/register";
  // Leave the signed-in pages first, so their queries unmount instead of
  // refetching without a token, then drop the previous user's data.
  void (onAuthPage
    ? Promise.resolve()
    : router.navigate({
        to: "/login",
        search: href === "/" ? {} : { next: href },
        replace: true,
      })
  ).then(() => queryClient.clear());
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
