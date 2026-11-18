import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";

/** The prototype's single-field dialog: new workspace, new project, rename. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  submitLabel,
  initialValue = "",
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  initialValue?: string;
  pending: boolean;
  error?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setValue(initialValue);
        onOpenChange(next);
      }}
      title={title}
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label={label} error={error}>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <DialogFooter>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            type="submit"
            disabled={!value.trim() || pending}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
