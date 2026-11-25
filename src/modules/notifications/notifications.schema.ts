import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const notificationIdParams = z.object({
  notificationId: z.uuid(),
});

export const listNotificationsQuery = paginationSchema.extend({
  unread: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const markNotificationSchema = z.object({
  read: z.boolean(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;
