import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import type { RoomConnection } from "../domain/room.js";
import type { PresenceService } from "../services/presence.service.js";
import { RoomEvents } from "../services/room-notifier.js";
import type { VoiceService } from "../services/voice.service.js";

/** Socket.IO endpoint path; kept under /api so one ingress rule routes REST and realtime to the backend. */
export const SOCKET_PATH = "/api/socket.io";

class SocketConnection implements RoomConnection {
  constructor(private readonly socket: Socket) {}

  get id(): string {
    return this.socket.id;
  }

  send(event: string, data: unknown): void {
    this.socket.emit(event, data);
  }
}

interface Handshake {
  pin: string;
  role: string;
  token: string;
}

function readHandshake(socket: Socket): Handshake {
  const source = { ...socket.handshake.query, ...(socket.handshake.auth as Record<string, unknown>) };
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  return { pin: str(source.pin, ""), role: str(source.role, "player"), token: str(source.token, "") };
}

/** WebRTC session descriptions and ICE candidates are a few KB; anything far larger is not signaling. */
const MAX_SIGNAL_BYTES = 16 * 1024;

const voiceJoinSchema = z.object({ session_id: z.string().min(1).max(64), mic_on: z.boolean(), speaker_on: z.boolean() });
const voiceStateSchema = z.object({ mic_on: z.boolean(), speaker_on: z.boolean() });
const voiceSignalSchema = z.object({
  to: z.string().min(1).max(64),
  to_session: z.string().min(1).max(64),
  data: z.record(z.string(), z.unknown()).refine((d) => JSON.stringify(d).length <= MAX_SIGNAL_BYTES),
});

/**
 * Voice sockets connect with `auth: { pin, role: "voice", token: <player session token> }` and exchange
 * `voice:*` events. They are separate from the game socket so voice survives page changes and never affects
 * game presence. Malformed messages are ignored.
 */
function attachVoiceHandlers(socket: Socket, voice: VoiceService, pin: string, playerId: string, conn: RoomConnection): void {
  socket.on("voice:join", (payload: unknown) => {
    const input = voiceJoinSchema.safeParse(payload);
    if (!input.success) return;
    const { session_id, mic_on, speaker_on } = input.data;
    void voice.join(pin, playerId, conn, { sessionId: session_id, micOn: mic_on, speakerOn: speaker_on });
  });
  socket.on("voice:leave", () => voice.leave(pin, playerId, conn));
  socket.on("voice:state", (payload: unknown) => {
    const input = voiceStateSchema.safeParse(payload);
    if (input.success) voice.setState(pin, playerId, conn, { micOn: input.data.mic_on, speakerOn: input.data.speaker_on });
  });
  socket.on("voice:signal", (payload: unknown) => {
    const input = voiceSignalSchema.safeParse(payload);
    if (!input.success) return;
    voice.signal(pin, playerId, conn, { to: input.data.to, toSession: input.data.to_session, data: input.data.data });
  });
  socket.on("disconnect", () => voice.disconnect(pin, conn));
}

/**
 * Clients connect with `io(url, { path: SOCKET_PATH, auth: { pin, role: "host" | "player", token } })`
 * and receive `room_state`, `game_started`, `answer_received`, `promoted_to_host`, `host_changed`
 * and `error` events. Invalid handshakes get an `error` event and are disconnected.
 */
export function attachSocketGateway(
  httpServer: HttpServer,
  presence: PresenceService,
  voice: VoiceService,
  corsOrigin: string | string[],
): Server {
  const io = new Server(httpServer, { path: SOCKET_PATH, cors: { origin: corsOrigin } });

  io.on("connection", (socket) => {
    const { pin, role, token } = readHandshake(socket);
    const conn = new SocketConnection(socket);
    const reject = (message: string) => {
      socket.emit(RoomEvents.Error, { message });
      socket.disconnect(true);
    };

    if (role === "voice") {
      const result = voice.connect(pin, token, conn);
      if (!result.ok) return reject(result.message);
      attachVoiceHandlers(socket, voice, pin, result.playerId!, conn);
      return;
    }

    if (role === "host") {
      const result = presence.connectHost(pin, token, conn);
      if (!result.ok) return reject(result.message);
      socket.on("disconnect", () => presence.disconnectHost(pin, conn));
      return;
    }

    const result = presence.connectPlayer(pin, token, conn);
    if (!result.ok) return reject(result.message);
    const playerId = result.playerId!;
    socket.on("disconnect", () => presence.disconnectPlayer(pin, playerId, conn));
  });

  return io;
}
