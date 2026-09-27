import cors from "cors";
import express, { type Express } from "express";
import type { Container } from "./container.js";
import { createErrorHandler, notFoundHandler } from "./http/middleware/errors.js";
import { createAdminRouter } from "./http/routes/admin.routes.js";
import { createAuthRouter } from "./http/routes/auth.routes.js";
import { createRoomRouter } from "./http/routes/room.routes.js";
import { createThemeRouter } from "./http/routes/theme.routes.js";

/** CORS origin option. Auth uses bearer tokens, not cookies, so credentials are never allowed cross-origin. */
export function corsOrigin(origins: string[]): string | string[] {
  return origins.includes("*") ? "*" : origins;
}

export function createApp(c: Container): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigin(c.config.corsOrigins) }));
  // Non-strict so a literal `null` body (axios' `post(url, null)`) parses instead of failing with 422.
  app.use(express.json({ strict: false }));

  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({ message: "TriviaStream API" });
  });
  api.use("/auth", createAuthRouter(c.authService, c.authMiddleware));
  api.use("/themes", createThemeRouter(c.themeService));
  api.use("/rooms", createRoomRouter(c.gameService, c.voiceService));
  api.use("/admin", createAdminRouter(c.themeService, c.questionFileParser, c.questionImport, c.authMiddleware));

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(createErrorHandler(c.logger));
  return app;
}
