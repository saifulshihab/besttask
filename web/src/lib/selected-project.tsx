import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { createContext, useContext, useState, type ReactNode } from "react";
import { lastProject } from "./last-visited";
import { projectsQuery } from "./queries";
import type { ProjectListItem } from "./types";

/**
 * The project the sidebar, search and due counts are about. On a project page
 * it is the project in the URL; on workspace pages (Members, Settings,
 * Notifications, Profile) it stays on the last one, which the project route
 * also saves per workspace so a reload keeps it. A saved project that is
 * archived or that the user can no longer see falls back to the first active
 * one; none at all is null.
 */
const SelectedProjectContext = createContext<ProjectListItem | null>(null);

export function SelectedProjectProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const urlProjectId = useParams({ strict: false }).projectId;
  const { data: projects } = useSuspenseQuery(projectsQuery(workspaceId));
  const [chosen, setChosen] = useState(() => ({
    workspaceId,
    projectId: urlProjectId ?? lastProject(workspaceId),
  }));

  // Follow the URL and workspace switches during render, so the sidebar never
  // shows the previous project for a frame.
  let next = chosen;
  if (next.workspaceId !== workspaceId) next = { workspaceId, projectId: lastProject(workspaceId) };
  if (urlProjectId && next.projectId !== urlProjectId) next = { workspaceId, projectId: urlProjectId };
  if (next !== chosen) setChosen(next);

  // An archived project stays selected only while its page is open; it can't
  // be chosen from the switcher.
  const project =
    projects.find((p) => p.id === next.projectId && (!p.archivedAt || p.id === urlProjectId)) ??
    projects.find((p) => !p.archivedAt) ??
    null;

  return (
    <SelectedProjectContext.Provider value={project}>{children}</SelectedProjectContext.Provider>
  );
}

/** The selected project, or null when the user has none in this workspace. */
export const useSelectedProject = () => useContext(SelectedProjectContext);
