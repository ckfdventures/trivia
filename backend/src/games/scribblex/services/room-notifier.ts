import type { Room, RoomConnection } from "../domain/room.js";
import { toPublicRoomState } from "../domain/room-view.js";
import type { ScribbleRoomStore } from "./room-store.js";

export const ScribbleEvents = {
  RoomState: "room:state",
  PlayerJoined: "room:playerJoined",
  PlayerLeft: "room:playerLeft",
  HostChanged: "room:hostChanged",
  Kicked: "room:kicked",
  Chat: "chat:message",
  Error: "room:error",
} as const;

/** Pushes events to everyone holding a connection to a room. */
export class ScribbleRoomNotifier {
  constructor(private readonly store: ScribbleRoomStore) {}

  broadcastState(room: Room): void {
    this.broadcast(room, ScribbleEvents.RoomState, toPublicRoomState(room));
  }

  broadcast(room: Room, event: string, data: unknown, exceptPlayerId?: string): void {
    // A room already removed from the store must not keep emitting to its old members.
    if (this.store.get(room.code) !== room) return;
    for (const [playerId, conn] of [...room.connections]) {
      if (playerId === exceptPlayerId) continue;
      try {
        conn.send(event, data);
      } catch {
        room.connections.delete(playerId);
      }
    }
  }

  sendState(conn: RoomConnection, room: Room): void {
    conn.send(ScribbleEvents.RoomState, toPublicRoomState(room));
  }

  send(conn: RoomConnection, event: string, data: unknown): void {
    try {
      conn.send(event, data);
    } catch {
      /* the socket is gone; the disconnect handler will clean it up */
    }
  }
}
