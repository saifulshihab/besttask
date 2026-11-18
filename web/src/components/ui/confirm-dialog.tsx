import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogFooter } from "./dialog";
import { Field, Input } from "./field";

/**
 * The prototype's destructive confirmation: title, explanation, optional
 * "Type X to confirm" field, and a red submit button.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  typeToConfirm,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** When set, the user must type this exact text first. */
  typeToConfirm?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const blocked = (typeToConfirm !== undefined && typed.trim() !== typeToConfirm) || pending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!blocked) onConfirm();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
      title={title}
      role="alertdialog"
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="m-0 text-base leading-normal text-ink-2">{body}</p>
        {typeToConfirm !== undefined ? (
          <Field label={`Type ${typeToConfirm} to confirm`}>
            <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="h-[38px]" />
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-xs text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" type="submit" disabled={blocked} autoFocus={typeToConfirm === undefined}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
