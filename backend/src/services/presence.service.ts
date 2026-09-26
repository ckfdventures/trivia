import { HOST_PROMOTION_GRACE_MS } from "../domain/constants.js";
import type { Player, Room, RoomConnection } from "../domain/room.js";
import { newId } from "../shared/ids.js";
import type { Logger } from "../shared/logger.js";
import type { GameService } from "./game.service.js";
import { RoomEvents, type RoomNotifier } from "./room-notifier.js";
import type { RoomStore } from "./room-store.js";

export type ConnectResult = { ok: true; playerId?: string } | { ok: false; message: string };

/**
 * Tracks who is connected to each room and hands the host role to a player
 * if the host stays disconnected past the grace period.
 */
export class PresenceService {
  constructor(
    private readonly store: RoomStore,
    private readonly notifier: RoomNotifier,
    private readonly game: GameService,
    private readonly logger: Logger,
    private readonly promotionGraceMs = HOST_PROMOTION_GRACE_MS,
  ) {}

  connectHost(pin: string, token: string, conn: RoomConnection): ConnectResult {
    const room = this.store.get(pin);
    if (!room) return { ok: false, message: "Room not found" };
    if (token !== room.hostToken) return { ok: false, message: "Invalid host token" };

    if (room.hostPromotionTimer) {
      clearTimeout(room.hostPromotionTimer);
      room.hostPromotionTimer = null;
    }
    room.host = conn;
    this.setHostPlayerConnected(room, true);
    this.notifier.sendState(conn, room);
    return { ok: true };
  }

  disconnectHost(pin: string, conn: RoomConnection): void {
    const room = this.store.get(pin);
    if (!room || room.host !== conn) return;
    room.host = null;
    this.setHostPlayerConnected(room, false);
    if (room.status !== "game_over") {
      room.hostPromotionTimer = setTimeout(() => this.promoteHost(pin), this.promotionGraceMs);
      room.hostPromotionTimer.unref();
    }
  }

  connectPlayer(pin: string, token: string, conn: RoomConnection): ConnectResult {
    const room = this.store.get(pin);
    if (!room) return { ok: false, message: "Room not found" };
    const player = this.findPlayer(room, token);
    if (!player) return { ok: false, message: "Player not found in room" };

    player.connected = true;
    room.connections.set(player.id, conn);
    this.notifier.broadcastState(room);
    this.notifier.sendState(conn, room);
    return { ok: true, playerId: player.id };
  }

  disconnectPlayer(pin: string, playerId: string, conn: RoomConnection): void {
    const room = this.store.get(pin);
    if (!room || room.connections.get(playerId) !== conn) return;
    room.connections.delete(playerId);
    const player = room.players.get(playerId);
    if (player) player.connected = false;
    this.notifier.broadcastState(room);
  }

  /** A playing host shows as connected while their host screen is. */
  private setHostPlayerConnected(room: Room, connected: boolean): void {
    const player = room.hostPlayerId ? room.players.get(room.hostPlayerId) : undefined;
    if (!player || player.connected === connected) return;
    player.connected = connected;
    this.notifier.broadcastState(room);
  }

  /** Players authenticate with their secret session token (never the public player id). */
  private findPlayer(room: Room, token: string): Player | undefined {
    if (!token) return undefined;
    return [...room.players.values()].find((p) => p.session_token === token);
  }

  private promoteHost(pin: string): void {
    const room = this.store.get(pin);
    if (!room || room.host) return;
    room.hostPromotionTimer = null;

    const candidate = [...room.players.values()].find((p) => p.connected);
    if (!candidate) {
      this.game.endGame(room);
      return;
    }

    const conn = room.connections.get(candidate.id);
    room.connections.delete(candidate.id);
    // The new host stops playing; once the game is underway they keep their score on the leaderboard.
    room.players.delete(candidate.id);
    if (room.status === "lobby") room.scores.delete(candidate.id);
    else room.departedPlayers.set(candidate.id, { nickname: candidate.nickname });
    room.hostToken = newId();
    room.hostId = newId();
    // The previous host's player entry (if any) stays in the game as a regular, disconnected player.
    room.hostPlayerId = null;

    if (conn) {
      try {
        conn.send(RoomEvents.PromotedToHost, { pin, host_token: room.hostToken, host_id: room.hostId });
      } catch (err) {
        this.logger.error(`failed to notify promoted host in ${pin}`, err);
      }
    }
    this.notifier.broadcast(room, RoomEvents.HostChanged, { nickname: candidate.nickname });
    this.notifier.broadcastState(room);
  }
}
