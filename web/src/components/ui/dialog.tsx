import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useOpener } from "@/lib/use-opener";

/**
 * Prototype modal: dimmed backdrop, card 80px from the top, 14px radius.
 * Base UI handles the focus trap, Escape, scroll lock and aria wiring.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  width = "max-w-[440px]",
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class; the prototype uses 440px, 520px and 560px. */
  width?: string;
  /** "alertdialog" for destructive confirmations. */
  role?: "dialog" | "alertdialog";
}) {
  const opener = useOpener(open);
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-backdrop transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup
          role={role}
          finalFocus={opener}
          className={cn(
            "fixed top-20 left-1/2 z-50 flex w-[calc(100%-32px)] -translate-x-1/2 flex-col gap-3.5 rounded-xl bg-raised p-5 shadow-modal ring-1 ring-raised-edge outline-none",
            "transition-[opacity,translate] duration-150 data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0",
            width,
          )}
        >
          <BaseDialog.Title className="m-0 text-lg font-bold">
            {title}
          </BaseDialog.Title>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Right-aligned Cancel / submit row used by every prototype dialog. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
