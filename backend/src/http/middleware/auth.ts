import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { User } from "../../domain/models.js";
import type { AuthService } from "../../services/auth.service.js";
import { forbidden, unauthorized } from "../../shared/http-error.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

export interface AuthMiddleware {
  /** Rejects the request with 401 unless it carries a valid bearer token. */
  required: RequestHandler;
  /** Like `required`, but also rejects non-admin users with 403. */
  admin: RequestHandler;
}

export function createAuthMiddleware(auth: AuthService): AuthMiddleware {
  const authenticate = async (req: Request): Promise<User> => {
    const token = bearerToken(req);
    if (!token) throw unauthorized("Not authenticated");
    req.user = await auth.authenticate(token);
    return req.user;
  };

  return {
    async required(req: Request, _res: Response, next: NextFunction) {
      await authenticate(req);
      next();
    },
    async admin(req: Request, _res: Response, next: NextFunction) {
      if ((await authenticate(req)).role !== "admin") throw forbidden("Admin access required");
      next();
    },
  };
}

/** The authenticated user; only call behind `auth.required` or `auth.admin`. */
export function currentUser(req: Request): User {
  if (!req.user) throw unauthorized("Not authenticated");
  return req.user;
}
