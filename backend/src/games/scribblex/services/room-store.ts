import { generateRoomCode } from "../domain/codes.js";
import { isJoinable, type Room } from "../domain/room.js";

/**
 * In-memory registry of live ScribbleX rooms, keyed by code.
 *
 * Deliberately separate from the trivia `RoomStore` rather than a shared abstraction: the two
 * games are being kept apart until both are stable, and the seams are narrow enough to merge
 * later. See DECISIONS.md D5.
 */
export class ScribbleRoomStore {
  private readonly rooms = new Map<string, Room>();

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  add(room: Room): void {
    this.rooms.set(room.code, room);
  }

  remove(code: string): Room | undefined {
    const room = this.rooms.get(code);
    this.rooms.delete(code);
    return room;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  /** Rooms a stranger may be dropped into: public, not finished, and not yet full. */
  joinablePublic(): Room[] {
    return this.all().filter((r) => !r.settings.isPrivate && isJoinable(r));
  }

  /** Every public room, joinable or not — the browser shows full rooms too, greyed out. */
  public(): Room[] {
    return this.all().filter((r) => !r.settings.isPrivate);
  }

  generateCode(): string {
    for (;;) {
      const code = generateRoomCode();
      if (!this.rooms.has(code)) return code;
    }
  }
}
