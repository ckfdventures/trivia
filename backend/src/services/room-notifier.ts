import type { Room, RoomConnection } from "../domain/room.js";
import { toPublicRoomState } from "../domain/room-view.js";
import type { RoomStore } from "./room-store.js";

export const RoomEvents = {
  RoomState: "room_state",
  GameStarted: "game_started",
  AnswerReceived: "answer_received",
  PromotedToHost: "promoted_to_host",
  HostChanged: "host_changed",
  Error: "error",
} as const;

/** Pushes events to everyone connected to a room (host first, then players). */
export class RoomNotifier {
  constructor(private readonly store: RoomStore) {}

  broadcastState(room: Room): void {
    this.broadcast(room, RoomEvents.RoomState, toPublicRoomState(room));
  }

  broadcast(room: Room, event: string, data: unknown): void {
    if (this.store.get(room.pin) !== room) return;
    if (room.host) {
      try {
        room.host.send(event, data);
      } catch {
        room.host = null;
      }
    }
    for (const [playerId, conn] of [...room.connections]) {
      try {
        conn.send(event, data);
      } catch {
        room.connections.delete(playerId);
      }
    }
  }

  sendState(conn: RoomConnection, room: Room): void {
    conn.send(RoomEvents.RoomState, toPublicRoomState(room));
  }
}
