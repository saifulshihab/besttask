import { actorOf } from "../../lib/actor.js";
import { route } from "../../lib/http.js";
import { projectIdParams } from "../projects/projects.schema.js";
import { channelIdParams, channelSchema } from "./chat.schema.js";
import * as chatService from "./chat.service.js";

export const chatController = {
  list: route({ params: projectIdParams }, ({ params, req }) =>
    chatService.list(actorOf(req), params.projectId),
  ),

  create: route(
    { params: projectIdParams, body: channelSchema },
    ({ params, body, req }) =>
      chatService.create(actorOf(req), params.projectId, body),
    201,
  ),

  rename: route(
    { params: channelIdParams, body: channelSchema },
    ({ params, body, req }) =>
      chatService.rename(actorOf(req), params.channelId, body),
  ),

  remove: route({ params: channelIdParams }, ({ params, req }) =>
    chatService.remove(actorOf(req), params.channelId),
  ),
};
