import { ROOM_CLEANUP_INTERVAL_MS, ROOM_TTL_MS } from "../domain/constants.js";
import type { GameService } from "../services/game.service.js";
import type { RoomStore } from "../services/room-store.js";
import type { Logger } from "../shared/logger.js";
import type { Job } from "./scheduler.js";

/** Drops rooms older than the room TTL, whatever their status. */
export class RoomCleanupJob implements Job {
  readonly name = "room-cleanup";
  readonly intervalMs = ROOM_CLEANUP_INTERVAL_MS;

  constructor(
    private readonly store: RoomStore,
    private readonly game: GameService,
    private readonly logger: Logger,
  ) {}

  run(): void {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const room of this.store.all()) {
      if (room.createdAt.getTime() >= cutoff) continue;
      this.store.remove(room.pin);
      this.game.disposeRoom(room);
      this.logger.info(`cleaned stale room ${room.pin}`);
    }
  }
}
