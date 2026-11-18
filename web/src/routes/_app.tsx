import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { hasSession } from "@/lib/auth";
import { meQuery } from "@/lib/queries";
import { useThemeSync } from "@/lib/theme";

/**
 * Every signed-in page sits under this pathless layout. The redirect happens
 * before anything renders, so there is no loading flash for signed-out users.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: ({ location }) => {
    if (!hasSession())
      throw redirect({
        to: "/login",
        search: location.href === "/" ? {} : { next: location.href },
      });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: SignedIn,
});

function SignedIn() {
  const { data: me } = useSuspenseQuery(meQuery);
  useThemeSync(me.theme);
  return <Outlet />;
}
