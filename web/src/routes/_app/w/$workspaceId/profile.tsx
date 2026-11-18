import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Page, PageHeader } from "@/components/page";
import { toast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { meQuery, projectsQuery, workspaceQuery, workspaceStatsQuery } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/design";
import { useUpdateProfile } from "@/lib/workspace-mutations";

export const Route = createFileRoute("/_app/w/$workspaceId/profile")({
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(workspaceStatsQuery(params.workspaceId));
  },
  component: Profile,
});

/** The prototype's zones first, then every other zone the browser knows. */
const COMMON_ZONES = ["Asia/Dhaka", "Europe/London", "America/New_York", "Asia/Tokyo"];
const allZones = () => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};
const zoneLabel = (zone: string) => {
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return `${zone.split("/").at(-1)!.replace(/_/g, " ")} (${offset})`;
  } catch {
    return zone;
  }
};

const input = "h-[38px] rounded-md border border-line-strong bg-canvas px-3 text-base outline-none focus:border-accent";
const MAX_AVATAR_BYTES = 140_000; // stays under the API's 200k data-URL limit

function Profile() {
  const { workspaceId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: workspace } = useSuspenseQuery(workspaceQuery(workspaceId));
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const { data: stats } = useQuery(workspaceStatsQuery(workspaceId));
  const update = useUpdateProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = { name: me.name, jobTitle: me.jobTitle, timezone: me.timezone, bio: me.bio };
  const [draft, setDraft] = useState(initial);
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => draft[k] !== initial[k]);
  const zones = [...new Set([...COMMON_ZONES, me.timezone, ...allZones()])];

  const roleLine =
    workspace.role === "WORKSPACE_OWNER"
      ? `Workspace owner of ${workspace.name}`
      : projects
          .filter((p) => !p.archivedAt)
          .map((p) => `${ROLE_LABELS[p.role]} · ${p.name}`)
          .join(", ") || `Member of ${workspace.name}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return toast.error("Your name can’t be empty");
    update.mutate({ ...draft, name: draft.name.trim() }, { onSuccess: () => toast("Profile saved") });
  };

  const pickAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast.error("Use a PNG, JPEG or WebP image");
    if (file.size > MAX_AVATAR_BYTES) return toast.error("Choose an image under 140 KB");
    const reader = new FileReader();
    reader.onload = () =>
      update.mutate({ avatar: String(reader.result) }, { onSuccess: () => toast("Photo updated") });
    reader.readAsDataURL(file);
  };

  const stat = (value: number | undefined, label: string) => (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line p-3">
      <span className="text-2xl font-bold">{value ?? "–"}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );

  return (
    <Page>
        <PageHeader title="Profile" description={`How you appear to people in ${workspace.name}.`} />
        <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-canvas p-[18px]">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar user={me} className="size-16 text-[22px]" />
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <span className="text-lg font-bold">{me.name}</span>
              <span className="text-sm text-muted">{me.email}</span>
              <span className="text-xs text-muted">{roleLine}</span>
            </div>
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickAvatar} />
              <Button onClick={() => fileRef.current?.click()}>Change photo</Button>
              {me.avatar ? (
                <Button variant="ghost" onClick={() => update.mutate({ avatar: "" }, { onSuccess: () => toast("Photo removed") })}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {stat(stats?.open, "Open tasks assigned")}
            {stat(stats?.done, "Tasks completed")}
            {stat(stats?.comments, `Comments in ${workspace.name}`)}
          </div>
        </section>

        <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-xl border border-line bg-canvas p-[18px]">
          <h2 className="m-0 text-md font-semibold">About you</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Name</span>
            <input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Job title</span>
            <input value={draft.jobTitle} maxLength={120} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Time zone</span>
            <Select
              value={draft.timezone}
              onValueChange={(timezone) => setDraft({ ...draft, timezone })}
              className="text-base"
              options={zones.map((z) => ({ value: z, label: zoneLabel(z) }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Bio</span>
            <textarea
              rows={3}
              value={draft.bio}
              maxLength={2000}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              placeholder="A line about what you work on"
              className="field-sizing-content resize-none max-h-[320px] min-h-[88px] rounded-md border border-line-strong bg-canvas px-3 py-2.5 text-base outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!dirty || update.isPending}>
              Save changes
            </Button>
            <Button disabled={!dirty} onClick={() => setDraft(initial)}>
              Discard
            </Button>
          </div>
        </form>
    </Page>
  );
}
