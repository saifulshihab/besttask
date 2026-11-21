/** Response shapes of the TaskFlow REST API (src/modules on the backend). */

export type Role = "WORKSPACE_OWNER" | "ADMIN" | "MEMBER";
export type TaskStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELLED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
}

export interface Me extends UserSummary {
  createdAt: string;
  avatar: string | null;
  jobTitle: string;
  bio: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  startPage: "board" | "list" | "activity";
}

export interface AuthResponse {
  user: Me;
  tokens: { accessToken: string; refreshToken: string };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** WORKSPACE_OWNER for the owner, MEMBER for everyone else. */
  role: Role;
  _count: { projects: number };
}

export interface CardFields {
  assignee: boolean;
  due: boolean;
  labels: boolean;
  subtasks: boolean;
  comments: boolean;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  archivedAt: string | null;
  color: string;
  seats: number;
  defaultStatus: TaskStatus;
  defaultPriority: Priority;
  showCancelled: boolean;
  wipLimit: number;
  cardFields: CardFields;
  createdAt: string;
  updatedAt: string;
  /** The caller's role on this project. */
  role: Role;
}

/** Row of GET /workspaces/:id/projects. */
export interface ProjectListItem extends Project {
  /** tasks counts open work only (not done or cancelled). */
  _count: { tasks: number; members: number };
}

/** GET /projects/:id. */
export interface ProjectDetail extends Project {
  seatsUsed: number;
}

/** Row of GET /projects/:id/members; the owner comes first. */
export interface ProjectPerson {
  id: string;
  userId: string;
  role: Role;
  active: boolean;
  user: UserSummary & { avatar: string | null };
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  key: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  creatorId: string;
  assigneeId: string | null;
  parentTaskId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  assignee: UserSummary | null;
  creator: UserSummary;
  project: { id: string; key: string; name: string; workspaceId: string };
  labels: Label[];
  _count: { subtasks: number; comments: number };
}

/** Returned by deletes that support Undo. */
export interface Recovery {
  recoveryId: string;
  expiresAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: UserSummary;
}

export type EntityType = "workspace" | "membership" | "project" | "task" | "comment" | "label";

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  projectId: string | null;
  actorId: string | null;
  entityType: EntityType;
  entityId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: UserSummary | null;
  /** Names for user ids the metadata mentions. */
  people: Record<string, UserSummary>;
}

/** Row of GET /workspaces/:id/members (owner only). */
export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  active: boolean;
  role: Role;
  createdAt: string;
  user: UserSummary & { avatar: string | null };
  projects: { projectId: string; role: Role; project: { id: string; name: string; key: string } }[];
}

/** Row of GET /projects/:id/candidates: active workspace users not on the project. */
export interface Candidate {
  id: string;
  userId: string;
  user: UserSummary;
}

export interface SavedView {
  id: string;
  name: string;
  projectId: string;
  filters: Record<string, string | string[] | boolean | number>;
  createdAt: string;
}

export interface WorkspaceStats {
  open: number;
  done: number;
  comments: number;
}

export type NotificationType = "task.assigned" | "task.status_changed" | "comment.created";

/** Row of GET /workspaces/:id/notifications (named to avoid the DOM's Notification). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  workspaceId: string;
  projectId: string;
  taskId: string;
  readAt: string | null;
  createdAt: string;
  metadata: { title?: string; from?: TaskStatus; to?: TaskStatus; excerpt?: string; commentId?: string } | null;
  actor: (UserSummary & { avatar: string | null }) | null;
  task: {
    id: string;
    key: string;
    title: string;
    status: TaskStatus;
    projectId: string;
    project: { key: string; name: string; color: string };
  };
}

/** GET /workspaces/:id/notifications/summary: the bell's numbers. */
export interface NotificationSummary {
  unread: number;
  overdue: number;
  dueToday: number;
}
