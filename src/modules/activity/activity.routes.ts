import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { activityController } from "./activity.controller.js";

export const projectActivityRouter = Router({ mergeParams: true });

projectActivityRouter.use(requireAuth);
projectActivityRouter.get("/", activityController.list);
