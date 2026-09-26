import { Router } from "express";
import type { AuthService } from "../../services/auth.service.js";
import type { AuthMiddleware } from "../middleware/auth.js";
import { currentUser } from "../middleware/auth.js";
import { loginSchema } from "../schemas.js";
import { parseBody } from "../validation.js";

export function createAuthRouter(authService: AuthService, auth: AuthMiddleware): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    res.json(await authService.login(parseBody(loginSchema, req)));
  });

  router.get("/me", auth.required, (req, res) => {
    res.json(currentUser(req));
  });

  // Bearer tokens are stateless; the client just discards the token.
  router.post("/logout", auth.required, (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}
