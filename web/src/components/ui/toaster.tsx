import { Toaster as Sonner } from "sonner";

/**
 * Toasts, bottom centre. Light surface in light mode and a raised dark one in
 * dark mode (tokens in styles.css); errors use the danger palette in both.
 * The message takes the free width so actions (Undo) and Cancel sit on the
 * right; long messages wrap beside them. Show toasts with `@/lib/toast`.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={24}
      // Clear of the mobile bottom navigation and New task button.
      mobileOffset={{ bottom: 156 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-full items-center gap-3 rounded-lg border border-toast-line bg-toast py-2.5 pr-2.5 pl-4 text-sm text-toast-ink shadow-toast " +
            "data-[type=error]:border-danger-line data-[type=error]:bg-danger-soft data-[type=error]:text-danger-ink",
          content: "flex min-w-0 flex-1 flex-col gap-0.5 py-0.5",
          title: "font-medium leading-snug break-words",
          description: "text-xs leading-snug text-muted group-data-[type=error]:text-danger-ink/80",
          icon:
            "flex shrink-0 [&_svg]:size-4 group-data-[type=success]:text-success group-data-[type=info]:text-accent-hover group-data-[type=warning]:text-warn-ink group-data-[type=error]:text-danger",
          actionButton:
            "order-2 h-[30px] shrink-0 cursor-pointer rounded-sm bg-toast-button px-2.5 text-sm font-semibold text-toast-button-ink hover:brightness-95 " +
            "group-data-[type=error]:bg-danger-solid group-data-[type=error]:text-white",
          cancelButton:
            "order-1 h-[30px] shrink-0 cursor-pointer rounded-sm px-2.5 text-sm font-medium text-muted hover:bg-hover hover:text-toast-ink",
          closeButton:
            "order-3 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted hover:bg-hover hover:text-toast-ink [&_svg]:size-3.5",
        },
      }}
    />
  );
}
