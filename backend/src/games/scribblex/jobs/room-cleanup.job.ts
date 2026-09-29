import type { Job } from "../../../jobs/scheduler.js";
import type { Logger } from "../../../shared/logger.js";
import { EMPTY_ROOM_TTL_MS, ROOM_CLEANUP_INTERVAL_MS } from "../domain/constants.js";
import { clearRoomTimers } from "../domain/room.js";
import type { ScribbleRoomStore } from "../services/room-store.js";

/**
 * Drops rooms nobody is connected to.
 *
 * Seats are normally released by the reconnect grace timer, but a room whose every player
 * vanished at once — a closed laptop lid, a dropped network — can outlive them all, so it is
 * swept here once it has been empty of connections for the TTL. PRD §7.
 */
export class ScribbleRoomCleanupJob implements Job {
  readonly name = "scribblex-room-cleanup";
  readonly intervalMs = ROOM_CLEANUP_INTERVAL_MS;

  constructor(
    private readonly store: ScribbleRoomStore,
    private readonly logger: Logger,
  ) {}

  run(): void {
    const cutoff = Date.now() - EMPTY_ROOM_TTL_MS;
    for (const room of this.store.all()) {
      if (room.connections.size > 0) continue;
      // An empty room is only stale once it has had time to fill; a freshly created one is
      // waiting for its host's socket to arrive.
      const lastActivity = Math.max(
        room.createdAt,
        ...[...room.players.values()].map((p) => p.disconnectedAt ?? p.joinedAt),
      );
      if (lastActivity >= cutoff) continue;

      clearRoomTimers(room);
      this.store.remove(room.code);
      this.logger.info(`cleaned stale ScribbleX room ${room.code}`);
    }
  }
}
