import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Page, PageHeader } from "@/components/page";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { signOut } from "@/lib/mutations";
import { meQuery } from "@/lib/queries";
import type { Me } from "@/lib/types";
import { useChangeEmail, useChangePassword, useDeleteAccount, useUpdateProfile } from "@/lib/workspace-mutations";

export const Route = createFileRoute("/_app/w/$workspaceId/account")({
  component: AccountSettings,
});

const card = "flex flex-col gap-3.5 rounded-xl border border-line bg-canvas p-[18px]";
const THEMES: { id: Me["theme"]; name: string }[] = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "Match system" },
];

function AccountSettings() {
  const { data: me } = useSuspenseQuery(meQuery);
  const update = useUpdateProfile();
  const [dialog, setDialog] = useState<"email" | "password" | "delete" | null>(null);
  const close = () => setDialog(null);

  return (
    <Page>
        <PageHeader
          title="Account settings"
          description="Sign-in, appearance and preferences. These apply in every workspace."
        />

        <section className={card}>
          <h2 className="m-0 text-md font-semibold">Appearance</h2>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={me.theme === t.id}
                onClick={() => update.mutate({ theme: t.id })}
                className={cn(
                  "h-10 rounded-md border text-sm font-medium",
                  me.theme === t.id
                    ? "border-accent bg-accent-tint text-accent-hover ring-1 ring-accent"
                    : "border-line-strong bg-canvas text-ink hover:bg-hover",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="m-0 text-md font-semibold">Preferences</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Open projects on</span>
            <Select
              value={me.startPage}
              onValueChange={(startPage) =>
                update.mutate({ startPage }, { onSuccess: () => toast("Preference saved") })
              }
              className="max-w-[320px] text-base"
              options={[
                { value: "board", label: "Board" },
                { value: "list", label: "List" },
                { value: "activity", label: "Activity" },
              ]}
            />
          </label>
        </section>

        <section className={card}>
          <h2 className="m-0 text-md font-semibold">Account</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">Email</span>
              <span className="text-sm text-muted">{me.email}</span>
            </div>
            <Button onClick={() => setDialog("email")}>Change email</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog("password")}>Change password</Button>
            <Button onClick={() => void signOut()} className="border-[#FCA5A5] font-semibold text-danger hover:bg-danger-soft">
              Sign out
            </Button>
          </div>
        </section>

        <section className="flex flex-col items-start gap-2 rounded-xl border border-danger-line p-[18px]">
          <h2 className="m-0 text-base font-semibold text-danger-ink">Delete account</h2>
          <p className="m-0 text-sm leading-normal text-muted">
            Removes your account from every workspace. Comments you wrote stay, shown as from a deleted user. Transfer or
            delete any workspace you own first.
          </p>
          <Button onClick={() => setDialog("delete")} className="border-[#FCA5A5] font-semibold text-danger hover:bg-danger-soft">
            Delete account…
          </Button>
        </section>

      {dialog === "email" ? <EmailDialog current={me.email} onClose={close} /> : null}
      {dialog === "password" ? <PasswordDialog onClose={close} /> : null}
      {dialog === "delete" ? <DeleteAccountDialog onClose={close} /> : null}
    </Page>
  );
}

function EmailDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const change = useChangeEmail();
  const [email, setEmail] = useState(current);
  const [currentPassword, setCurrentPassword] = useState("");
  const next = email.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate(
      { email: next, currentPassword },
      { onSuccess: () => (onClose(), toast("Email updated")) },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Change email">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Email address" hint="You’ll sign in with this address from now on.">
          <Input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Current password" hint="Confirms it’s you before the sign-in email changes." error={change.error?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            type="submit"
            disabled={!next || next === current || !currentPassword || change.isPending}
          >
            Save email
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8 || mismatch) return;
    change.mutate(
      { currentPassword, password },
      // Changing the password signs out every session, this one included.
      { onSuccess: () => toast("Password changed. Sign in with your new password.") },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Change password">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Current password" error={change.error?.message}>
          <Input autoFocus type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters. You’ll be signed out everywhere.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Passwords don’t match" : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            type="submit"
            disabled={!currentPassword || password.length < 8 || confirm !== password || change.isPending}
          >
            Change password
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const remove = useDeleteAccount();
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    remove.mutate(password, { onSuccess: () => toast("Your account was deleted") });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Delete your account?" role="alertdialog">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <p className="m-0 text-base leading-normal text-ink-2">
          This can’t be undone. Enter your password to confirm.
        </p>
        <Field label="Password" error={remove.error?.message}>
          <Input autoFocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" type="submit" disabled={!password || remove.isPending}>
            Delete account
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
