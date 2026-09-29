import type { Socket } from "socket.io";
import { HttpError } from "../../../shared/http-error.js";
import type { Logger } from "../../../shared/logger.js";
import type { RoomConnection } from "../domain/room.js";
import { fillSchema, kickSchema, readySchema, settingsPatchSchema, strokeSchema } from "../http/schemas.js";
import type { ScribbleDrawingService } from "../services/drawing.service.js";
import { ScribbleEvents, type ScribbleRoomNotifier } from "../services/room-notifier.js";
import type { ScribbleRoomService } from "../services/room.service.js";

/**
 * ScribbleX sockets carry live room state only.
 *
 * Creating and joining a room happens over REST first, so the client arrives here already
 * holding a player id and session token — the same split the trivia game uses, and it keeps
 * HTTP status codes (404 unknown code, 409 full or already started) available to the join
 * form. See DECISIONS.md D11.
 *
 *   io(url, { path: SOCKET_PATH, auth: { role: "scribblex", code, playerId, token } })
 */

interface Handshake {
  code: string;
  playerId: string;
  token: string;
}

function readHandshake(socket: Socket): Handshake {
  const source = { ...socket.handshake.query, ...(socket.handshake.auth as Record<string, unknown>) };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { code: str(source.code), playerId: str(source.playerId), token: str(source.token) };
}

class SocketConnection implements RoomConnection {
  constructor(private readonly socket: Socket) {}

  get id(): string {
    return this.socket.id;
  }

  send(event: string, data: unknown): void {
    this.socket.emit(event, data);
  }
}

/**
 * Wire one ScribbleX socket. Returns false when the handshake is rejected, so the caller can
 * disconnect it.
 */
export function attachScribbleSocket(
  socket: Socket,
  rooms: ScribbleRoomService,
  notifier: ScribbleRoomNotifier,
  drawing: ScribbleDrawingService,
  logger: Logger,
): boolean {
  const { code, playerId, token } = readHandshake(socket);
  const conn = new SocketConnection(socket);

  const result = rooms.connect(code, playerId, token, conn);
  if (!result.ok) {
    socket.emit(ScribbleEvents.Error, { message: result.message });
    return false;
  }

  const room = rooms.getRoom(code);
  if (!room) {
    socket.emit(ScribbleEvents.Error, { message: "Room not found" });
    return false;
  }
  const roomCode = room.code;
  notifier.sendState(conn, room);
  // A client arriving mid-drawing needs the canvas as it already stands.
  drawing.sync(room, conn);

  /** Run a host/player action, reporting a refusal back to the caller rather than throwing. */
  const guard = (action: () => void) => {
    try {
      action();
    } catch (err) {
      if (err instanceof HttpError) {
        socket.emit(ScribbleEvents.Error, {
          message: typeof err.detail === "string" ? err.detail : "That isn't allowed.",
        });
        return;
      }
      logger.error(`scribblex socket action failed in ${roomCode}`, err);
      socket.emit(ScribbleEvents.Error, { message: "Something went wrong. Try again." });
    }
  };

  socket.on("room:updateSettings", (payload: unknown) => {
    const input = settingsPatchSchema.safeParse(payload);
    if (!input.success) return;
    guard(() => rooms.updateSettings(roomCode, playerId, input.data));
  });

  socket.on("room:ready", (payload: unknown) => {
    const input = readySchema.safeParse(payload);
    if (!input.success) return;
    guard(() => rooms.setReady(roomCode, playerId, input.data.ready));
  });

  socket.on("room:kick", (payload: unknown) => {
    const input = kickSchema.safeParse(payload);
    if (!input.success) return;
    guard(() => rooms.kick(roomCode, playerId, input.data.player_id));
  });

  socket.on("room:leave", () => guard(() => rooms.leave(roomCode, playerId)));

  // Drawing is high-frequency and self-authorising: a payload that does not parse, or comes
  // from someone who may not draw, is dropped silently rather than answered with an error.
  socket.on("draw:stroke", (payload: unknown) => {
    const input = strokeSchema.safeParse(payload);
    if (input.success) drawing.stroke(roomCode, playerId, input.data);
  });
  socket.on("draw:fill", (payload: unknown) => {
    const input = fillSchema.safeParse(payload);
    if (input.success) drawing.fill(roomCode, playerId, input.data);
  });
  socket.on("draw:undo", () => drawing.undo(roomCode, playerId));
  socket.on("draw:redo", () => drawing.redo(roomCode, playerId));
  socket.on("draw:clear", () => drawing.clear(roomCode, playerId));

  socket.on("disconnect", () => rooms.disconnect(roomCode, playerId, conn));
  return true;
}
