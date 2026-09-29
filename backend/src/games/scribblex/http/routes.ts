import { type Request, Router } from "express";
import { notFound } from "../../../shared/http-error.js";
import { parseBody } from "../../../http/validation.js";
import { formatRoomCode } from "../domain/codes.js";
import { toPublicRoomState, toRoomSummary } from "../domain/room-view.js";
import type { Room } from "../domain/room.js";
import type { PlayerSession, ScribbleRoomService } from "../services/room.service.js";
import type { ScribbleDeckService } from "../services/deck.service.js";
import type { ScribbleRoomStore } from "../services/room-store.js";
import { createRoomSchema, profileBodySchema, type profileSchema } from "./schemas.js";
import type { z } from "zod";

type CodeParams = Request<{ code: string }>;

/** The client's half of a seat: everything it needs to open its socket and remember the room. */
function toSeat(room: Room, session: PlayerSession) {
  return {
    code: room.code,
    display_code: formatRoomCode(room.code),
    player_id: session.playerId,
    session_token: session.sessionToken,
    room: toPublicRoomState(room),
  };
}

/** Wire-shaped profile (`avatar_id`) to the domain's camelCase. */
function toProfile(input: z.infer<typeof profileSchema>) {
  return { name: input.name, avatarId: input.avatar_id, hatId: input.hat_id };
}

/**
 * Creating and joining are REST so the join form gets real status codes — 404 for an unknown
 * code, 409 for full or already started. Everything live happens over the socket instead.
 */
export function createScribbleRouter(
  rooms: ScribbleRoomService,
  store: ScribbleRoomStore,
  decks: ScribbleDeckService,
): Router {
  const router = Router();

  /** The deck catalogue the lobby offers. Public: choosing decks needs no account. */
  router.get("/decks", async (_req, res) => {
    res.json(await decks.list());
  });

  /**
   * The public room browser. Lists every public room, full and in-progress included, each
   * carrying its own `joinable` flag — a list that quietly hid full rooms would make the
   * count disagree with what a player can see happening.
   */
  router.get("/rooms", (_req, res) => {
    const rooms = store
      .public()
      .map(toRoomSummary)
      // Joinable first, then the busiest: what a browser is looking for is a game to get into.
      .sort((a, b) => Number(b.joinable) - Number(a.joinable) || b.player_count - a.player_count);
    res.json(rooms);
  });

  router.post("/rooms", (req, res) => {
    const { profile, settings } = parseBody(createRoomSchema, req);
    const { room, ...session } = rooms.createRoom(toProfile(profile), settings ?? {});
    res.status(201).json(toSeat(room, session));
  });

  router.post("/rooms/quick-play", (req, res) => {
    const { profile } = parseBody(profileBodySchema, req);
    const { room, ...session } = rooms.quickPlay(toProfile(profile));
    res.status(201).json(toSeat(room, session));
  });

  router.post("/rooms/:code/join", (req: CodeParams, res) => {
    const { profile } = parseBody(profileBodySchema, req);
    const { room, ...session } = rooms.joinRoom(req.params.code, toProfile(profile));
    res.status(201).json(toSeat(room, session));
  });

  /** Look a room up before joining it, so the form can say "full" or "already started". */
  router.get("/rooms/:code", (req: CodeParams, res) => {
    const room = rooms.getRoom(req.params.code);
    if (!room) throw notFound("No room with that code.");
    res.json(toPublicRoomState(room));
  });

  return router;
}
