import { Router } from "express";
import type { ThemeService } from "../../services/theme.service.js";

/** Public theme catalogue, used by hosts to pick what to play. */
export function createThemeRouter(themes: ThemeService): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await themes.list());
  });

  return router;
}
