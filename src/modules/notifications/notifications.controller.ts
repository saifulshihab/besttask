import { actorOf } from "../../lib/actor.js";
import { route } from "../../lib/http.js";
import { workspaceIdParams } from "../workspaces/workspaces.schema.js";
import {
  listNotificationsQuery,
  markNotificationSchema,
  notificationIdParams,
  notificationSummaryQuery,
} from "./notifications.schema.js";
import * as notificationService from "./notifications.service.js";

export const notificationsController = {
  list: route(
    { params: workspaceIdParams, query: listNotificationsQuery },
    ({ params, query, req }) =>
      notificationService.list(actorOf(req), params.workspaceId, query),
  ),

  summary: route(
    { params: workspaceIdParams, query: notificationSummaryQuery },
    ({ params, query, req }) =>
      notificationService.summary(actorOf(req), params.workspaceId, query),
  ),

  markAllRead: route({ params: workspaceIdParams }, ({ params, req }) =>
    notificationService.markAllRead(actorOf(req), params.workspaceId),
  ),

  mark: route(
    { params: notificationIdParams, body: markNotificationSchema },
    ({ params, body, req }) =>
      notificationService.mark(actorOf(req), params.notificationId, body.read),
  ),
};
