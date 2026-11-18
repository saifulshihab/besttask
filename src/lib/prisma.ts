import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../env.js";
import { PrismaClient } from "../generated/prisma/client.js";

// Opening a TLS connection to the hosted database costs ~300ms, against ~50ms
// for a query on an open one. pg's default 10s idle timeout closed the pool
// after every pause, so most requests paid that setup again. Keep connections
// open and alive instead; the adapter drops any the server closes.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 5 * 60_000,
  keepAlive: true,
});

export const prisma = new PrismaClient({
  adapter,
  transactionOptions: { timeout: 20000 },
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/**
 * Opens a few connections before the first request arrives, so the first
 * page load after a (re)start does not pay connection setup in parallel.
 */
export const warmPool = (connections = 4) =>
  Promise.all(
    Array.from({ length: connections }, () => prisma.$queryRaw`SELECT 1`),
  );
