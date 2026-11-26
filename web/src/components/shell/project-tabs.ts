/** Every page of a project, as the last segment of its URL. */
export const PROJECT_TABS = [
  "board",
  "list",
  "calendar",
  "my-work",
  "activity",
  "members",
  "settings",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

/** The task views, shown as tabs in the project header. */
export const VIEW_TABS = ["board", "list", "calendar"] as const satisfies readonly ProjectTab[];

export const isViewTab = (tab: ProjectTab) => (VIEW_TABS as readonly string[]).includes(tab);
