import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Prototype-styled menu over Base UI, which supplies keyboard navigation,
 * focus management, typeahead and outside-click dismissal.
 */
export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

export function MenuPopup({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  matchTrigger = false,
  className,
}: {
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Make the popup exactly as wide as its trigger. */
  matchTrigger?: boolean;
  className?: string;
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-30 outline-none"
      >
        <BaseMenu.Popup
          className={cn(
            "flex max-h-(--available-height) min-w-[180px] flex-col gap-0.5 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-popover outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            matchTrigger && "w-(--anchor-width)",
            className,
          )}
        >
          <BaseMenu.Group className="flex flex-col gap-0.5">
            {children}
          </BaseMenu.Group>
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({
  className,
  tone = "default",
  ...props
}: ComponentProps<typeof BaseMenu.Item> & { tone?: "default" | "danger" }) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm outline-none select-none",
        "data-[highlighted]:bg-menu-hover",
        tone === "danger" ? "text-danger" : "text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <BaseMenu.GroupLabel className="px-2.5 py-1 text-xs text-muted">
      {children}
    </BaseMenu.GroupLabel>
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 h-px bg-line" />;
}
