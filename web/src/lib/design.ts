import type { Priority, Role, TaskStatus } from "./types";

/**
 * Domain colors and labels from the design prototype, keyed by the API's
 * enum values. `dot` is the status marker on cards, tabs and filters.
 */
export const STATUSES: Record<
  TaskStatus,
  { name: string; dot: string; bg: string; fg: string; hue: string }
> = {
  BACKLOG: { name: "Backlog", dot: "border-2 border-dashed border-[#78716C]", bg: "#E7E5E4", fg: "#44403C", hue: "#78716C" },
  TODO: { name: "To do", dot: "border-2 border-[#1D4ED8]", bg: "#DBEAFE", fg: "#1E3A8A", hue: "#1D4ED8" },
  IN_PROGRESS: { name: "In progress", dot: "border-2 border-[#B45309] bg-[#FDE68A]", bg: "#FEF3C7", fg: "#78350F", hue: "#B45309" },
  IN_REVIEW: { name: "In review", dot: "border-2 border-[#7C3AED] bg-[#DDD6FE]", bg: "#EDE9FE", fg: "#4C1D95", hue: "#7C3AED" },
  DONE: { name: "Done", dot: "border-2 border-[#15803D] bg-[#15803D]", bg: "#DCFCE7", fg: "#14532D", hue: "#15803D" },
  CANCELLED: { name: "Cancelled", dot: "border-2 border-[#78716C] bg-[#D6D3D1]", bg: "#E7E5E4", fg: "#57534E", hue: "#78716C" },
};

/**
 * A status pill's colors (board column headers, activity moves): the
 * prototype's tint and ink in light mode, the status hue blended into the
 * theme in dark mode (color-scheme: dark), so it stays readable.
 */
export const statusPillColors = (status: TaskStatus) => {
  const s = STATUSES[status];
  return {
    background: `light-dark(${s.bg}, color-mix(in srgb, ${s.hue} 26%, var(--color-canvas)))`,
    color: `light-dark(${s.fg}, color-mix(in srgb, ${s.hue} 40%, var(--color-ink)))`,
  };
};

export const STATUS_ORDER: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

/** `bars` is how many of the three priority bars are filled; `hot` ones are red. */
export const PRIORITIES: Record<
  Priority,
  { name: string; bars: number; hot: boolean; rank: number }
> = {
  URGENT: { name: "Urgent", bars: 3, hot: true, rank: 0 },
  HIGH: { name: "High", bars: 3, hot: true, rank: 1 },
  MEDIUM: { name: "Medium", bars: 2, hot: false, rank: 2 },
  LOW: { name: "Low", bars: 1, hot: false, rank: 3 },
};

/**
 * Label palette. The API stores a label's color as `hex` (the six values the
 * label editor offers); chips render with the matching tint and ink.
 */
export const LABEL_COLORS = [
  { name: "Sky", hex: "#0E7490", bg: "#E0F2FE", fg: "#075985" },
  { name: "Violet", hex: "#7C3AED", bg: "#EDE9FE", fg: "#5B21B6" },
  { name: "Green", hex: "#15803D", bg: "#DCFCE7", fg: "#14532D" },
  { name: "Amber", hex: "#B45309", bg: "#FEF3C7", fg: "#78350F" },
  { name: "Pink", hex: "#BE185D", bg: "#FCE7F3", fg: "#831843" },
  { name: "Stone", hex: "#57534E", bg: "#E7E5E4", fg: "#44403C" },
] as const;

/**
 * Chip colors for a stored label color. Presets use their prototype tint and
 * ink; a custom color is mixed with the theme's surface and text so any hue
 * stays readable in light and dark mode.
 */
export const labelChipColors = (hex: string) => {
  const known = LABEL_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  // Dark mode (color-scheme: dark) always mixes, presets included.
  const darkBg = `color-mix(in srgb, ${hex} 24%, var(--color-canvas))`;
  const darkFg = `color-mix(in srgb, ${hex} 45%, var(--color-ink))`;
  return known
    ? { background: `light-dark(${known.bg}, ${darkBg})`, color: `light-dark(${known.fg}, ${darkFg})` }
    : {
        background: `light-dark(color-mix(in srgb, ${hex} 16%, var(--color-canvas)), ${darkBg})`,
        color: `light-dark(color-mix(in srgb, ${hex} 70%, var(--color-ink)), ${darkFg})`,
      };
};

export const PROJECT_COLORS = [
  "#0E7490",
  "#7C3AED",
  "#B45309",
  "#BE185D",
  "#15803D",
  "#1D4ED8",
] as const;

/** The first preset no label uses yet, so new labels stay distinguishable; cycles after six. */
export const nextLabelColor = (used: readonly { color: string }[]) =>
  LABEL_COLORS.find((c) => !used.some((l) => l.color.toLowerCase() === c.hex.toLowerCase()))?.hex ??
  LABEL_COLORS[used.length % LABEL_COLORS.length]!.hex;

/** Presets for the color pickers: projects show the solid color, labels their chip tint. */
export const PROJECT_COLOR_PRESETS = PROJECT_COLORS.map((hex, i) => ({
  hex,
  name: ["Teal", "Violet", "Amber", "Pink", "Green", "Blue"][i]!,
}));
export const LABEL_COLOR_PRESETS = LABEL_COLORS.map((c) => ({ hex: c.hex, name: c.name, fill: c.bg, ring: c.fg }));

export const ROLE_LABELS: Record<Role, string> = {
  WORKSPACE_OWNER: "Workspace Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

const AVATAR_COLORS = [
  ["#FDE68A", "#78350F"],
  ["#BFDBFE", "#1E3A8A"],
  ["#BBF7D0", "#14532D"],
  ["#FBCFE8", "#831843"],
  ["#DDD6FE", "#4C1D95"],
  ["#FED7AA", "#7C2D12"],
] as const;

/** Initials from the name when there is one, otherwise from the email. */
export const initialsOf = (name: string | undefined, email: string) => {
  const words = (name?.trim() || email.split("@")[0] || "?")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = words[0]?.charAt(0) ?? "?";
  const second = words.length > 1 ? (words[1]?.charAt(0) ?? "") : "";
  return (first + second).toUpperCase();
};

/** Stable avatar colors per email, the same hash the prototype uses. */
export const avatarColors = (email: string) => {
  let hash = 0;
  for (let i = 0; i < email.length; i++)
    hash = (hash + email.charCodeAt(i)) % AVATAR_COLORS.length;
  const [background, color] = AVATAR_COLORS[hash] ?? AVATAR_COLORS[0];
  return { background, color };
};

/** Role pill colors: owner amber, admin indigo, member stone. */
export const roleBadge = (role: Role) =>
  role === "WORKSPACE_OWNER"
    ? "border-warn-line bg-warn-soft text-warn-ink"
    : role === "ADMIN"
      ? "border-[#C7D2FE] bg-accent-soft text-accent-ink"
      : "border-line bg-menu-hover text-ink-2";

/** "Full" / "Almost full" (80%+) badge text for a seat count. */
export const seatState = (used: number, limit: number) =>
  used >= limit ? "Full" : used / limit >= 0.8 ? "Almost full" : "";

/** Seat bar fill color: teal, amber when almost full, red when full. */
export const seatBarColor = (used: number, limit: number) =>
  used >= limit ? "#B91C1C" : used / limit >= 0.8 ? "#B45309" : "#0E7490";
