import type { RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
import { sessionFromToken } from "../lib/session.js";
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(unauthorized("Missing Bearer token"));
    return;
  }
  try {
    req.actor = (await sessionFromToken(header.slice(7))).actor;
    next();
  } catch (error) {
    next(error);
  }
};
