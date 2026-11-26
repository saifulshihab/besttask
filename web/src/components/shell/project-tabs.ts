/** Every page of a project, as the last segment of its URL. */
export const PROJECT_TABS = [
  "board",
  "list",
  "calendar",
  "my-work",
  "chat",
  "activity",
  "members",
  "settings",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

/** The task views, shown as tabs in the project header. */
export const VIEW_TABS = ["board", "list", "calendar"] as const satisfies readonly ProjectTab[];

export const isViewTab = (tab: ProjectTab) => (VIEW_TABS as readonly string[]).includes(tab);

/**
 * The project page a path is on: the segment after /p/<projectId>/, so
 * deeper pages (a chat conversation) still count as their tab. Null on
 * workspace pages.
 */
export const tabOf = (pathname: string): ProjectTab | null => {
  const segment = pathname.match(/\/p\/[^/]+\/([^/]+)/)?.[1] as ProjectTab | undefined;
  return segment && PROJECT_TABS.includes(segment) ? segment : null;
};
