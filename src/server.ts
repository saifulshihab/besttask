import "dotenv/config";
import { corsOrigins, createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { prisma, warmPool } from "./lib/prisma.js";
import { attachRealtime, closeRealtime } from "./lib/realtime.js";
import { registerChatHandlers } from "./modules/chat/chat.socket.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
  void warmPool().catch((error) =>
    logger.warn({ error }, "Database pool warm-up failed"),
  );
});

// Chat sockets share the HTTP server and port (/socket.io).
attachRealtime(server, {
  origins: corsOrigins(),
  onConnection: registerChatHandlers,
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  // Open sockets would keep server.close() waiting.
  closeRealtime();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

import { purgeExpired } from "./lib/recovery.js";
let purging = false;
const recoveryTimer = setInterval(() => {
  if (purging) return;
  purging = true;
  void purgeExpired()
    .catch((error) => logger.error({ error }, "Recovery cleanup failed"))
    .finally(() => {
      purging = false;
    });
}, 1000);
recoveryTimer.unref();
