import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { RoomConnection } from "../domain/room.js";
import type { PresenceService } from "../services/presence.service.js";
import { RoomEvents } from "../services/room-notifier.js";

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

/**
 * Clients connect with `io(url, { path: SOCKET_PATH, auth: { pin, role: "host" | "player", token } })`
 * and receive `room_state`, `game_started`, `answer_received`, `promoted_to_host`, `host_changed`
 * and `error` events. Invalid handshakes get an `error` event and are disconnected.
 */
export function attachSocketGateway(httpServer: HttpServer, presence: PresenceService, corsOrigin: string | string[]): Server {
  const io = new Server(httpServer, { path: SOCKET_PATH, cors: { origin: corsOrigin } });

  io.on("connection", (socket) => {
    const { pin, role, token } = readHandshake(socket);
    const conn = new SocketConnection(socket);
    const reject = (message: string) => {
      socket.emit(RoomEvents.Error, { message });
      socket.disconnect(true);
    };

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
