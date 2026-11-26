import type { Actor } from "./actor.js";
import { unauthorized } from "./errors.js";
import { prisma } from "./prisma.js";
import { verifyAccessToken } from "./tokens.js";

/**
 * Resolves an access token to its actor and session. The session (refresh
 * token row) must still be live: signing out or changing the password
 * revokes it even though the access token itself has not expired. Used by
 * the HTTP middleware and the socket handshake.
 */
export const sessionFromToken = async (
  token: unknown,
): Promise<{ actor: Actor; sessionId: string }> => {
  if (typeof token !== "string" || !token) throw unauthorized("Missing Bearer token");
  const payload = verifyAccessToken(token);
  const session = await prisma.refreshToken.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  )
    throw unauthorized("Session expired");
  return {
    actor: { id: session.user.id, email: session.user.email },
    sessionId: session.id,
  };
};
