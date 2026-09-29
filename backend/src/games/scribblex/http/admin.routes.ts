import { type Request, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "../../../domain/constants.js";
import { HttpError } from "../../../shared/http-error.js";
import type { AuthMiddleware } from "../../../http/middleware/auth.js";
import { parseBody } from "../../../http/validation.js";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "../domain/constants.js";
import type { ScribbleDeckService } from "../services/deck.service.js";
import type { WordFileParser } from "../services/word-file-parser.js";

type IdParams = Request<{ id: string }>;

const deckMetaSchema = z.object({
  name: z.string().min(1).max(60),
  blurb: z.string().max(120).optional(),
  emoji: z.string().max(8).optional(),
});

const deckPatchSchema = deckMetaSchema.partial();

const wordsSchema = z.object({
  words: z.array(z.string().min(MIN_WORD_LENGTH).max(MAX_WORD_LENGTH)).min(1).max(5000),
});

const removeWordSchema = z.object({ word: z.string().min(1).max(MAX_WORD_LENGTH) });

/**
 * Owner-only management of ScribbleX word decks.
 *
 * Deliberately the same shape as the trivia question bank — list, create, rename, delete, then
 * upload → preview → import — so the admin panel has one way of doing things rather than two.
 */
export function createScribbleAdminRouter(
  decks: ScribbleDeckService,
  parser: WordFileParser,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  router.use(auth.admin);

  router.get("/decks", async (_req, res) => {
    res.json(await decks.list());
  });

  /** One deck including its words — the editor needs them; the lobby never does. */
  router.get("/decks/:id", async (req: IdParams, res) => {
    res.json(await decks.get(req.params.id));
  });

  router.post("/decks", async (req, res) => {
    res.status(201).json(await decks.create(parseBody(deckMetaSchema, req)));
  });

  router.patch("/decks/:id", async (req: IdParams, res) => {
    res.json(await decks.update(req.params.id, parseBody(deckPatchSchema, req)));
  });

  router.delete("/decks/:id", async (req: IdParams, res) => {
    await decks.delete(req.params.id);
    res.status(204).end();
  });

  router.post("/decks/:id/words", async (req: IdParams, res) => {
    res.status(201).json(await decks.addWords(req.params.id, parseBody(wordsSchema, req).words));
  });

  router.delete("/decks/:id/words", async (req: IdParams, res) => {
    res.json(await decks.removeWord(req.params.id, parseBody(removeWordSchema, req).word));
  });

  // Step 1: read a file and show what it contains. Nothing is saved.
  router.post("/decks/upload", upload.single("file"), (req, res) => {
    if (!req.file) throw new HttpError(422, [{ type: "missing", loc: ["body", "file"], msg: "Field required" }]);
    res.json(parser.analyze(req.file.buffer, req.file.originalname));
  });

  return router;
}
