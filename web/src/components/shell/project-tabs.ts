export const PROJECT_TABS = [
  "board",
  "list",
  "calendar",
  "activity",
  "members",
  "settings",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];
