import { Router } from "express";
import type { GameService } from "../../services/game.service.js";
import { answerSchema, createRoomSchema, hostTokenQuerySchema, joinRoomSchema } from "../schemas.js";
import { parseBody, parseQuery } from "../validation.js";

export function createRoomRouter(game: GameService): Router {
  const router = Router();
  const hostToken = (req: Parameters<typeof parseQuery>[1]) => parseQuery(hostTokenQuerySchema, req).host_token;

  router.post("/", async (req, res) => {
    const { theme_id, question_count, host_nickname } = parseBody(createRoomSchema, req);
    res.json(await game.createRoom(theme_id, question_count, host_nickname));
  });

  router.get("/:pin", (req, res) => {
    res.json(game.getPublicState(req.params.pin));
  });

  router.post("/:pin/join", (req, res) => {
    res.json(game.join(req.params.pin, parseBody(joinRoomSchema, req).nickname));
  });

  router.post("/:pin/start", (req, res) => {
    res.json(game.start(req.params.pin, hostToken(req)));
  });

  router.post("/:pin/next", (req, res) => {
    res.json(game.next(req.params.pin, hostToken(req)));
  });

  router.post("/:pin/skip", (req, res) => {
    res.json(game.skip(req.params.pin, hostToken(req)));
  });

  router.post("/:pin/end", (req, res) => {
    res.json(game.end(req.params.pin, hostToken(req)));
  });

  router.post("/:pin/answer", (req, res) => {
    res.json(game.submitAnswer(req.params.pin, parseBody(answerSchema, req)));
  });

  return router;
}
