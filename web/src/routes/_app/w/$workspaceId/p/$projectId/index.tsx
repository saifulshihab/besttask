import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/w/$workspaceId/p/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/p/$projectId/board",
      params,
      replace: true,
    });
  },
});
