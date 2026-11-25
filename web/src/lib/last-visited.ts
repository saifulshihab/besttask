/** Remembers the last workspace and project per browser, to reopen them on "/". */
const WORKSPACE_KEY = "bt_last_workspace";
const projectKey = (workspaceId: string) => `bt_last_project:${workspaceId}`;

const get = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const set = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); remembering is optional.
  }
};

export const lastWorkspace = () => get(WORKSPACE_KEY);
export const rememberWorkspace = (id: string) => set(WORKSPACE_KEY, id);
export const lastProject = (workspaceId: string) => get(projectKey(workspaceId));
export const rememberProject = (workspaceId: string, projectId: string) =>
  set(projectKey(workspaceId), projectId);
