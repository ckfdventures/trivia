import { PIN_LENGTH } from "../domain/constants.js";
import type { Room } from "../domain/room.js";
import { randomDigits } from "../shared/ids.js";

/**
 * In-memory registry of live rooms, keyed by PIN.
 * State lives in this process only, so the server must run as a single instance.
 */
export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  get(pin: string): Room | undefined {
    return this.rooms.get(pin);
  }

  add(room: Room): void {
    this.rooms.set(room.pin, room);
  }

  remove(pin: string): Room | undefined {
    const room = this.rooms.get(pin);
    this.rooms.delete(pin);
    return room;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  generatePin(): string {
    for (;;) {
      const pin = randomDigits(PIN_LENGTH);
      if (!this.rooms.has(pin)) return pin;
    }
  }
}
