import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { chatController } from "./chat.controller.js";

export const projectChannelsRouter = Router({ mergeParams: true });

projectChannelsRouter.use(requireAuth);
projectChannelsRouter.get("/", chatController.list);
projectChannelsRouter.post("/", chatController.create);

export const channelsRouter = Router();

channelsRouter.use(requireAuth);
channelsRouter.patch("/:channelId", chatController.rename);
channelsRouter.delete("/:channelId", chatController.remove);
