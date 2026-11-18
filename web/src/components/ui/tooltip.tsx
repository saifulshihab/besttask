import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shares the open delay, so moving between nearby tooltips shows the next one at once. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <BaseTooltip.Provider delay={400} closeDelay={0}>
    {children}
  </BaseTooltip.Provider>
);

/**
 * Prototype-styled tooltip, replacing the browser's `title`. The child element
 * becomes the trigger. A disabled button gets no pointer events, so pass
 * `wrap` to put the trigger on a wrapping span instead.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  wrap = false,
  disabled = false,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  wrap?: boolean;
  disabled?: boolean;
}) {
  if (disabled || !content) return children;
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        render={wrap ? <span className="inline-flex" tabIndex={0}>{children}</span> : children}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-[70]">
          <BaseTooltip.Popup
            className={cn(
              "max-w-[260px] rounded-md bg-toast-ink px-2 py-1 text-xs font-medium text-toast shadow-popover",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
