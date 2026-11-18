import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "h-10 w-full rounded-md border border-line-strong bg-canvas px-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

/** A labelled form control with an optional hint and error, as in the prototype dialogs. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold text-ink">{label}</span>
      {children}
      {hint && !error ? (
        <span className="text-xs leading-normal text-muted">{hint}</span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/**
 * The ✕ inside a search field. It keeps focus in the input (mouse down is
 * prevented) so typing can continue straight after clearing.
 */
export function SearchClear({ onClear, className }: { onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Clear search"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
    >
      <X size={13} aria-hidden />
    </button>
  );
}
