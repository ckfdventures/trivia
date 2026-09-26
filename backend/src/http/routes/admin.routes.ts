import { type Request, Router } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES } from "../../domain/constants.js";
import type { QuestionFileParser } from "../../services/question-file-parser.js";
import type { QuestionImportService } from "../../services/question-import.service.js";
import type { ThemeService } from "../../services/theme.service.js";
import { HttpError } from "../../shared/http-error.js";
import type { AuthMiddleware } from "../middleware/auth.js";
import { importQuestionsSchema, themeNameSchema } from "../schemas.js";
import { parseBody } from "../validation.js";

type IdParams = Request<{ id: string }>;

/** Owner-only management of themes, questions and question-bank uploads. */
export function createAdminRouter(
  themes: ThemeService,
  parser: QuestionFileParser,
  importer: QuestionImportService,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  router.use(auth.admin);

  router.get("/themes", async (_req, res) => {
    res.json(await themes.list());
  });

  router.post("/themes", async (req, res) => {
    res.status(201).json(await themes.create(parseBody(themeNameSchema, req).name));
  });

  router.patch("/themes/:id", async (req: IdParams, res) => {
    res.json(await themes.rename(req.params.id, parseBody(themeNameSchema, req).name));
  });

  router.delete("/themes/:id", async (req: IdParams, res) => {
    await themes.delete(req.params.id);
    res.status(204).end();
  });

  router.get("/themes/:id/questions", async (req: IdParams, res) => {
    res.json(await themes.listQuestions(req.params.id));
  });

  router.delete("/questions/:id", async (req: IdParams, res) => {
    await themes.deleteQuestion(req.params.id);
    res.status(204).end();
  });

  // Step 1: validate a CSV/JSON file and preview its rows. Nothing is saved.
  router.post("/question-bank/upload", upload.single("file"), (req, res) => {
    if (!req.file) throw new HttpError(422, [{ type: "missing", loc: ["body", "file"], msg: "Field required" }]);
    res.json(parser.analyze(req.file.buffer, req.file.originalname));
  });

  // Step 2: add the previewed rows to a theme's pool.
  router.post("/question-bank/import", async (req, res) => {
    const { questions, ...target } = parseBody(importQuestionsSchema, req);
    res.status(201).json(await importer.importInto(target, questions));
  });

  return router;
}
