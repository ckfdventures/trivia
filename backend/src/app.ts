import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";
import type { Container } from "./container.js";
import { createScribbleAdminRouter } from "./games/scribblex/http/admin.routes.js";
import { createScribbleRouter } from "./games/scribblex/http/routes.js";
import { createErrorHandler, notFoundHandler } from "./http/middleware/errors.js";
import { createAdminRouter } from "./http/routes/admin.routes.js";
import { createAuthRouter } from "./http/routes/auth.routes.js";
import { createRoomRouter } from "./http/routes/room.routes.js";
import { createThemeRouter } from "./http/routes/theme.routes.js";

/** What `cors` accepts as an origin rule: "*", a list, or a decision function. */
export type OriginOption = NonNullable<CorsOptions["origin"]>;

/** `https://app-*.vercel.app` → a regex. `*` matches within one label, never across dots. */
function toPattern(glob: string): RegExp {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Only `*` survives as a wildcard, and it cannot cross a dot — so `https://us-*.example.com`
  // can never be satisfied by `https://us-evil.attacker.com.example.com`.
  return new RegExp(`^${escaped.replace(/\\\*/g, "[^.]*")}$`);
}

/**
 * CORS origin option. Auth uses bearer tokens, not cookies, so credentials are never allowed
 * cross-origin.
 *
 * Entries may contain `*` as a wildcard, which is what makes preview deployments workable:
 * every commit gets its own hostname, so they cannot be listed one by one. `CORS_ORIGINS=*`
 * still means "anything" as before.
 */
export function corsOrigin(origins: string[]): OriginOption {
  if (origins.includes("*")) return "*";

  const exact = new Set(origins.filter((o) => !o.includes("*")));
  const patterns = origins.filter((o) => o.includes("*")).map(toPattern);
  if (patterns.length === 0) return [...exact];

  return (origin, callback) => {
    // No Origin header: same-origin, curl, or a server-to-server call. Not a CORS decision.
    if (!origin) return callback(null, true);
    callback(null, exact.has(origin) || patterns.some((p) => p.test(origin)));
  };
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
  api.use("/scribblex", createScribbleRouter(c.scribbleRooms, c.scribbleStore, c.scribbleDecks));
  // ScribbleX decks sit under /admin/scribblex so both games share one admin surface.
  api.use("/admin/scribblex", createScribbleAdminRouter(c.scribbleDecks, c.scribbleWordParser, c.authMiddleware));
  api.use("/admin", createAdminRouter(c.themeService, c.questionFileParser, c.questionImport, c.authMiddleware));

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(createErrorHandler(c.logger));
  return app;
}
