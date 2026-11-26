import { tooManyRequests } from "../../lib/errors.js";
import { ackOf, errorPayload, type RealtimeSocket } from "../../lib/realtime.js";
import { sendMessageSchema } from "./chat.schema.js";
import * as chatService from "./chat.service.js";

/** Messages one socket may send per window before it is told to slow down. */
const RATE = { messages: 20, windowMs: 10_000 };

const limiter = () => {
  let sent: number[] = [];
  return () => {
    const now = Date.now();
    sent = sent.filter((at) => now - at < RATE.windowMs);
    if (sent.length >= RATE.messages) return false;
    sent.push(now);
    return true;
  };
};

/** Chat events on one socket. Validation and authorization live in the service. */
export const registerChatHandlers = (socket: RealtimeSocket) => {
  const allow = limiter();
  socket.on("message:send", async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      if (!allow()) throw tooManyRequests("You're sending messages too quickly");
      const input = sendMessageSchema.parse(payload);
      const message = await chatService.sendMessage(
        socket.data.actor,
        socket.data.workspaceId,
        input,
      );
      reply({ ok: true, data: message });
    } catch (error) {
      reply({ ok: false, error: errorPayload(error) });
    }
  });
};
