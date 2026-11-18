import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Sizes are the prototype's control heights: 32px toolbar controls, 36px
 * header actions, 38px dialog footers, 40px page-level calls to action.
 */
const sizes = {
  sm: "h-8 px-2.5 text-sm",
  md: "h-9 px-3.5 text-sm",
  lg: "h-[38px] px-4 text-sm",
  xl: "h-10 px-4 text-base",
  icon: "size-9 justify-center",
  "icon-sm": "size-8 justify-center",
  "icon-xs": "size-7 justify-center rounded-sm",
} as const;

const variants = {
  primary: "bg-accent font-semibold text-white hover:bg-accent-strong",
  secondary: "border border-line-strong bg-canvas text-ink hover:bg-hover",
  ghost: "bg-transparent text-ink-2 hover:bg-hover",
  danger: "bg-danger-solid font-semibold text-white hover:brightness-90",
  link: "bg-transparent font-medium text-accent-hover hover:bg-hover",
} as const;

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md border-0 whitespace-nowrap transition-colors",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
