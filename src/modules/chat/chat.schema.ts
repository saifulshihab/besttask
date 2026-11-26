import { z } from "zod";

export const channelIdParams = z.object({
  channelId: z.uuid(),
});

/** Lowercase words joined by single dashes, like design-review. */
const channelName = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a channel name")
  .max(40, "Use 40 characters or fewer")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single dashes",
  );

export const channelSchema = z.object({ name: channelName });

export const sendMessageSchema = z.object({
  target: z.union([
    z.object({ channelId: z.uuid() }),
    z.object({ projectId: z.uuid(), userId: z.uuid() }),
  ]),
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(4000, "Messages can be up to 4000 characters"),
  clientId: z.string().min(1).max(64).optional(),
});

export type ChannelInput = z.infer<typeof channelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
