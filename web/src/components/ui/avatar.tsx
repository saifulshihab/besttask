import { avatarColors, initialsOf } from "@/lib/design";
import { cn } from "@/lib/cn";
import { usePhoto } from "./avatar-directory";
import { Tooltip } from "./tooltip";

const sizes = {
  xs: "size-[22px] text-[10px]",
  sm: "size-6 text-[10px]",
  md: "size-7 text-2xs",
  lg: "size-9 text-xs",
} as const;

export function Avatar({
  user,
  size = "md",
  className,
  tooltip = false,
}: {
  user: { name?: string; email: string; avatar?: string | null };
  size?: keyof typeof sizes;
  className?: string;
  /** Show the person's name on hover; for places that show only the avatar. */
  tooltip?: boolean;
}) {
  const base = cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
    sizes[size],
    className,
  );
  const photo = usePhoto(user);
  const face = photo ? (
    <img src={photo} alt={tooltip ? (user.name ?? user.email) : ""} className={cn(base, "object-cover")} />
  ) : (
    // Beside a visible name the initials are noise, so they're hidden from
    // screen readers; alone (tooltip), the avatar is an image named for the person.
    <span
      className={base}
      style={avatarColors(user.email)}
      {...(tooltip ? { role: "img", "aria-label": user.name ?? user.email } : { "aria-hidden": true })}
    >
      {initialsOf(user.name, user.email)}
    </span>
  );
  return tooltip ? <Tooltip content={user.name ?? user.email}>{face}</Tooltip> : face;
}
