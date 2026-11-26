import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

/**
 * An avatar with a presence dot: filled when online, an outline ring when
 * offline (told apart by shape as well as color), none while unknown.
 */
export function PresenceAvatar({
  user,
  online,
  size = "xs",
  ring = "ring-canvas",
}: {
  user: { name?: string; email: string; avatar?: string | null };
  online: boolean | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  /** The surface behind the dot, so it reads as cut out of the avatar. */
  ring?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar user={user} size={size} />
      {online === undefined ? null : (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 box-border size-2.5 rounded-full ring-2",
            ring,
            online ? "bg-success" : "border-2 border-muted bg-canvas",
          )}
        />
      )}
    </span>
  );
}
