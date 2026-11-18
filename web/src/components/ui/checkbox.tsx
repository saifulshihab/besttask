import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A real `<input type="checkbox">` (so labels, keyboard, forms and tests work
 * as usual) drawn in the prototype's style instead of the browser's.
 */
export function Checkbox({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"input">, "type" | "size"> & { size?: "md" | "lg" }) {
  return (
    <span className={cn("relative inline-flex shrink-0", size === "lg" ? "size-[18px]" : "size-4", className)}>
      <input
        type="checkbox"
        className={cn(
          "peer m-0 size-full cursor-pointer appearance-none rounded-[4px] border-[1.5px] border-line-strong bg-canvas transition-colors",
          "hover:border-faint checked:border-accent checked:bg-accent checked:hover:border-accent-strong checked:hover:bg-accent-strong",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong",
        )}
        {...props}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto size-[75%] scale-50 text-white opacity-0 transition-[opacity,scale] duration-100 peer-checked:scale-100 peer-checked:opacity-100"
      />
    </span>
  );
}
