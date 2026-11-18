import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useOpener } from "@/lib/use-opener";

/** Prototype mobile bottom sheet: grab handle, title, close, scrollable body. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const opener = useOpener(open);
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Popup finalFocus={opener} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col gap-3 overflow-y-auto rounded-t-[20px] bg-canvas px-4 pt-2.5 pb-7 outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <span aria-hidden className="h-1 w-10 self-center rounded-[2px] bg-line" />
          <div className="flex items-center gap-2">
            <BaseDialog.Title className="m-0 flex-1 text-[17px] font-bold">{title}</BaseDialog.Title>
            <BaseDialog.Close
              aria-label="Close"
              className="flex size-10 items-center justify-center rounded-[10px] bg-menu-hover text-ink"
            >
              <X size={18} aria-hidden />
            </BaseDialog.Close>
          </div>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const sheetInput =
  "h-[46px] rounded-xl border border-line bg-canvas px-3 text-[16px] text-ink outline-none focus:border-accent";
