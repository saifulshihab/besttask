import { Router } from "express";
import { projectActivityRouter } from "./modules/activity/activity.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import {
  commentsRouter,
  taskCommentsRouter,
} from "./modules/comments/comments.routes.js";
import {
  labelsRouter,
  workspaceLabelsRouter,
} from "./modules/labels/labels.routes.js";
import {
  projectsRouter,
  workspaceProjectsRouter,
} from "./modules/projects/projects.routes.js";
import {
  projectTasksRouter,
  tasksRouter,
} from "./modules/tasks/tasks.routes.js";
import {
  notificationsRouter,
  workspaceNotificationsRouter,
} from "./modules/notifications/notifications.routes.js";
import { workspacesRouter } from "./modules/workspaces/workspaces.routes.js";

import { viewsRouter } from "./modules/projects/views.routes.js";
export const apiRouter = Router();
apiRouter.use("/projects/:projectId/views", viewsRouter);

apiRouter.use("/auth", authRouter);

// Nested routers come first so their paths are not swallowed by the
// workspace/project/task routers mounted on the shorter prefixes.
apiRouter.use("/workspaces/:workspaceId/projects", workspaceProjectsRouter);
apiRouter.use("/projects/:projectId/labels", workspaceLabelsRouter);
apiRouter.use(
  "/workspaces/:workspaceId/notifications",
  workspaceNotificationsRouter,
);
apiRouter.use("/projects/:projectId/tasks", projectTasksRouter);
apiRouter.use("/projects/:projectId/activity", projectActivityRouter);
apiRouter.use("/tasks/:taskId/comments", taskCommentsRouter);

apiRouter.use("/workspaces", workspacesRouter);
apiRouter.use("/projects", projectsRouter);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/labels", labelsRouter);
apiRouter.use("/comments", commentsRouter);
apiRouter.use("/notifications", notificationsRouter);

import { route } from "./lib/http.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { actorOf } from "./lib/actor.js";
import { undo } from "./lib/recovery.js";
import { z } from "zod";
apiRouter.post(
  "/recovery/:id/undo",
  requireAuth,
  route({ params: z.object({ id: z.uuid() }) }, ({ req, params }) =>
    undo(actorOf(req), params.id),
  ),
);
