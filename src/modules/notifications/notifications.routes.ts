import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { notificationsController } from "./notifications.controller.js";

export const workspaceNotificationsRouter = Router({ mergeParams: true });

workspaceNotificationsRouter.use(requireAuth);
workspaceNotificationsRouter.get("/", notificationsController.list);
workspaceNotificationsRouter.get("/summary", notificationsController.summary);
workspaceNotificationsRouter.post("/read-all", notificationsController.markAllRead);

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.patch("/:notificationId", notificationsController.mark);
