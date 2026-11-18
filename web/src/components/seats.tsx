import { NumberStepper } from "@/components/ui/number-stepper";
import { cn } from "@/lib/cn";
import { seatBarColor } from "@/lib/design";

/** Seat usage line with a Full / Almost full badge and a colored bar. */
export function SeatMeter({
  used,
  limit,
  state,
  className,
}: {
  used: number;
  limit: number;
  state: string;
  className?: string;
}) {
  const free = Math.max(0, limit - used);
  return (
    <span className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold whitespace-nowrap">
          {used} of {limit} seats used
        </span>
        {free ? <span className="text-xs whitespace-nowrap text-muted">{free} free</span> : null}
        {state ? (
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full border px-2 text-2xs font-semibold whitespace-nowrap",
              used >= limit
                ? "border-danger-line bg-danger-soft text-danger-ink"
                : "border-warn-line bg-warn-soft text-warn-ink",
            )}
          >
            {state}
          </span>
        ) : null}
      </span>
      <span className="h-1.5 overflow-hidden rounded-[3px] bg-line-soft">
        <span
          className="block h-full rounded-[3px]"
          style={{
            width: `${limit ? Math.min(100, Math.round((used / limit) * 100)) : 100}%`,
            background: seatBarColor(used, limit),
          }}
        />
      </span>
    </span>
  );
}

/** − [n] + control for a seat limit (1–100); never below the seats in use. */
export function SeatStepper({
  value,
  min,
  onChange,
  className,
}: {
  value: number;
  min: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <NumberStepper
      value={value}
      min={min}
      max={100}
      onChange={onChange}
      label="Seat limit"
      decrementLabel="Fewer seats"
      incrementLabel="More seats"
      className={className}
    />
  );
}
