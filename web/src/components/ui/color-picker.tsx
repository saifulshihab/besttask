import { Popover } from "@base-ui/react/popover";
import { Check, Pipette } from "lucide-react";
import { useState, type ReactNode } from "react";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/cn";

const HEX = /^#[0-9a-f]{6}$/i;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface ColorPreset {
  hex: string;
  name: string;
  /** Optional swatch fill (e.g. a label's light tint); defaults to `hex`. */
  fill?: string;
  /** Optional ring color when selected; defaults to `hex`. */
  ring?: string;
}

/**
 * Hue/shade area (react-colorful), a hex field and a preview. `onCommit`
 * fires for a finished choice: pointer up, Enter in the field, or "Use color".
 */
export function ColorPanel({
  value,
  onCommit,
  preview,
}: {
  value: string;
  onCommit: (hex: string) => void;
  /** Renders the preview, e.g. a label chip in the chosen color. */
  preview?: (hex: string) => ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(value.toUpperCase());
  const [synced, setSynced] = useState(value);
  if (!same(value, synced)) {
    setSynced(value);
    setDraft(value);
    setText(value.toUpperCase());
  }
  const typed = text.startsWith("#") ? text : `#${text}`;
  const valid = HEX.test(typed);

  return (
    <div className="flex w-[224px] flex-col gap-2.5">
      <HexColorPicker
        color={draft}
        onChange={(hex) => (setDraft(hex), setText(hex.toUpperCase()))}
        className="tf-color-picker"
      />
      <div className="flex items-center gap-2">
        <span className="size-8 shrink-0 rounded-md border border-line" style={{ background: draft }} aria-hidden />
        <label className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-line-strong bg-canvas px-2 focus-within:border-accent">
          <span className="sr-only">Hex color</span>
          <input
            value={text}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!valid}
            onChange={(e) => {
              const next = e.target.value.trim();
              setText(next);
              const hex = next.startsWith("#") ? next : `#${next}`;
              if (HEX.test(hex)) setDraft(hex.toLowerCase());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (valid) onCommit(typed.toLowerCase());
              }
            }}
            className="w-full min-w-0 border-0 bg-transparent font-mono text-sm text-ink uppercase outline-none"
          />
        </label>
      </div>
      {preview ? <div className="flex min-h-7 items-center">{preview(draft)}</div> : null}
      <button
        type="button"
        disabled={!valid}
        onClick={() => onCommit(draft.toLowerCase())}
        className="h-8 rounded-md bg-accent text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
      >
        Use color
      </button>
    </div>
  );
}

/**
 * Preset swatches plus a custom swatch that opens the color panel. The custom
 * swatch shows the current color when it isn't one of the presets. Pass
 * `inline` inside another popover so the panel expands in place instead of
 * opening a second popover.
 */
export function ColorField({
  value,
  onChange,
  presets,
  label,
  shape = "circle",
  size = "md",
  inline = false,
  preview,
}: {
  value: string;
  onChange: (hex: string) => void;
  presets: readonly ColorPreset[];
  label: string;
  shape?: "circle" | "square";
  size?: "sm" | "md" | "lg";
  inline?: boolean;
  preview?: (hex: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const custom = !presets.some((p) => same(p.hex, value));
  const dim = size === "sm" ? "size-5" : size === "lg" ? "size-8" : "size-7";
  const round = shape === "circle" ? "rounded-full" : "rounded-[9px]";
  const commit = (hex: string) => {
    setOpen(false);
    if (!same(hex, value)) onChange(hex);
  };

  // The selected ring takes the swatch's own color (set inline as --tw-ring-color).
  const swatch = (selected: boolean) =>
    cn(
      dim,
      round,
      "relative shrink-0 cursor-pointer outline-none transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      selected ? "ring-2 ring-offset-2 ring-offset-canvas" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
    );

  const customButton = (
    <span
      className={cn(
        dim,
        round,
        "flex items-center justify-center",
        custom
          ? "ring-2 ring-offset-2 ring-offset-canvas [--tw-ring-color:var(--color-ink)]"
          : "bg-[conic-gradient(from_180deg,#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)]",
      )}
      style={custom ? { background: value } : undefined}
    >
      {custom ? (
        <Check size={size === "sm" ? 11 : 14} strokeWidth={3} className="text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.6)]" aria-hidden />
      ) : (
        <Pipette size={size === "sm" ? 10 : 13} className="text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]" aria-hidden />
      )}
    </span>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const on = same(p.hex, value);
          return (
            <button
              key={p.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.name}
              onClick={() => (setOpen(false), on ? null : onChange(p.hex))}
              className={swatch(on)}
              style={{ background: p.fill ?? p.hex, ...(on ? { ["--tw-ring-color" as string]: p.ring ?? p.hex } : {}) }}
            >
              {on && shape === "square" ? (
                <Check size={14} strokeWidth={3} className="absolute inset-0 m-auto text-white" aria-hidden />
              ) : null}
            </button>
          );
        })}
        </div>
        {inline ? (
          <button
            type="button"
            aria-pressed={custom}
            aria-label="Custom color"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(dim, round, "shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}
          >
            {customButton}
          </button>
        ) : (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
              aria-pressed={custom}
              aria-label="Custom color"
              className={cn(dim, round, "shrink-0 cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}
            >
              {customButton}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={8} className="z-[60]">
                <Popover.Popup
                  className={cn(
                    "rounded-lg border border-line bg-canvas p-3 shadow-popover outline-none",
                    "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                  )}
                >
                  <ColorPanel value={value} onCommit={commit} preview={preview} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
      {inline && open ? <ColorPanel value={value} onCommit={commit} preview={preview} /> : null}
    </div>
  );
}

/**
 * A single swatch showing the current color; it opens the presets and the
 * custom panel together. For lists where a full swatch row would be too busy.
 */
export function ColorButton({
  value,
  onChange,
  presets,
  label,
  preview,
}: {
  value: string;
  onChange: (hex: string) => void;
  presets: readonly ColorPreset[];
  label: string;
  preview?: (hex: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pick = (hex: string) => {
    setOpen(false);
    if (!same(hex, value)) onChange(hex);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent data-[popup-open]:bg-hover"
      >
        <span className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ background: value }} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={8} className="z-[60]">
          <Popover.Popup
            className={cn(
              "flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3 shadow-popover outline-none",
              "origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            <div role="radiogroup" aria-label="Preset colors" className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const on = same(p.hex, value);
                return (
                  <button
                    key={p.hex}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={p.name}
                    onClick={() => pick(p.hex)}
                    className={cn(
                      "size-6 cursor-pointer rounded-full outline-none transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      on ? "ring-2 ring-offset-2 ring-offset-canvas" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
                    )}
                    style={{ background: p.fill ?? p.hex, ...(on ? { ["--tw-ring-color" as string]: p.ring ?? p.hex } : {}) }}
                  />
                );
              })}
            </div>
            <span className="h-px bg-line-soft" />
            <ColorPanel value={value} onCommit={pick} preview={preview} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
