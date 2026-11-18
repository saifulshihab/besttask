import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Shown before the label, in the list and on the trigger (a status dot, an avatar…). */
  icon?: ReactNode;
  /** Secondary text shown after the label in the list only (an email, a role hint). */
  hint?: ReactNode;
  /** Plain text for typeahead when `label` is not a string. */
  text?: string;
}

const sizes = {
  sm: "h-[34px] px-2.5 text-sm",
  md: "h-[38px] px-3 text-sm",
  lg: "h-10 px-3 text-base",
  /** Phone sheets: matches their 46px, 16px-text inputs. */
  xl: "h-[46px] rounded-xl px-3 text-[16px]",
} as const;

/**
 * Prototype-styled replacement for the native `<select>`. Base UI supplies
 * keyboard navigation, typeahead and focus handling; an option whose value is
 * "" acts as the "none" choice (Unassigned, All projects…).
 */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  id,
  disabled,
  autoFocus,
  placeholder,
  className,
  popupClassName,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  size?: keyof typeof sizes;
  id?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: ReactNode;
  className?: string;
  popupClassName?: string;
  "aria-label"?: string;
}) {
  // Base UI reserves null for "no value"; map the "" option onto it.
  const toInner = (v: T) => (v === "" ? null : v);
  const items = options.map((o) => ({
    value: toInner(o.value),
    label: o.text ?? (typeof o.label === "string" ? o.label : String(o.value)),
  }));

  return (
    <BaseSelect.Root
      value={toInner(value)}
      onValueChange={(next) => onValueChange((next ?? "") as T)}
      items={items}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        id={id}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={cn(
          "group flex w-full min-w-0 cursor-default items-center gap-2 rounded-md border border-line-strong bg-canvas text-left text-ink outline-none select-none",
          "hover:border-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
          "data-[popup-open]:border-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 data-[disabled]:hover:border-line-strong",
          sizes[size],
          className,
        )}
      >
        <BaseSelect.Value className="flex min-w-0 flex-1 items-center gap-2">
          {(inner: string | null) => {
            const option = options.find((o) => toInner(o.value) === inner);
            if (!option) return <span className="truncate text-faint">{placeholder ?? "Select…"}</span>;
            return (
              <>
                {option.icon}
                <span className="truncate">{option.label}</span>
              </>
            );
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="flex shrink-0 text-muted group-hover:text-ink-2">
          <ChevronsUpDown size={14} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-[60] outline-none"
        >
          <BaseSelect.Popup
            className={cn(
              "max-h-[min(var(--available-height),320px)] min-w-(--anchor-width) overflow-y-auto rounded-lg border border-line bg-canvas p-1.5 shadow-popover outline-none",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              popupClassName,
            )}
          >
            <BaseSelect.List className="flex flex-col gap-0.5">
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={toInner(o.value)}
                  label={o.text ?? (typeof o.label === "string" ? o.label : undefined)}
                  className={cn(
                    "flex min-h-9 cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-2.5 text-sm text-ink outline-none select-none max-sm:min-h-11 max-sm:text-[15px]",
                    "data-[highlighted]:bg-menu-hover data-[selected]:font-medium",
                  )}
                >
                  {o.icon}
                  <BaseSelect.ItemText className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate">{o.label}</span>
                    {o.hint ? <span className="truncate text-xs font-normal text-muted">{o.hint}</span> : null}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="flex shrink-0 text-accent">
                    <Check size={14} aria-hidden />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
