import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "@/lib/toast";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { lastWorkspace } from "@/lib/last-visited";
import { useQuery } from "@tanstack/react-query";
import { signOut, useCreateWorkspace } from "@/lib/mutations";
import { meQuery, workspacesQuery } from "@/lib/queries";

/** "/" opens the last-used workspace, else the first one, else onboarding. */
export const Route = createFileRoute("/_app/")({
  loader: async ({ context }) => {
    const workspaces = await context.queryClient.ensureQueryData(workspacesQuery);
    const remembered = lastWorkspace();
    const target =
      workspaces.find((w) => w.id === remembered) ?? workspaces[0];
    if (target)
      throw redirect({
        to: "/w/$workspaceId",
        params: { workspaceId: target.id },
        replace: true,
      });
  },
  component: FirstWorkspace,
});

function FirstWorkspace() {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const { data: me } = useQuery(meQuery);
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(name.trim(), {
      onSuccess: (workspace) => {
        toast(`Created ${workspace.name}`);
        void navigate({ to: "/w/$workspaceId", params: { workspaceId: workspace.id } });
      },
    });
  };
  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[440px] flex-col gap-3.5 rounded-xl border border-line bg-canvas p-7"
      >
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-bold">You’re not in any workspace yet</h1>
          <p className="m-0 text-sm leading-normal text-muted">
            Create one to get started — you’ll be its owner. Or ask a teammate to add you
            {me ? (
              <>
                {" "}using <span className="font-medium text-ink">{me.email}</span>
              </>
            ) : null}
            .
          </p>
        </div>
        <Field label="Workspace name" error={create.error?.message}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Studio"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="xl"
          className="justify-center"
          disabled={!name.trim() || create.isPending}
        >
          Create workspace
        </Button>
        <p className="m-0 border-t border-line pt-3.5 text-center text-sm text-muted">
          Wrong account?{" "}
          <button
            type="button"
            onClick={() => void signOut()}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-danger hover:underline"
          >
            Sign out
          </button>
        </p>
      </form>
    </div>
  );
}
