import { formatRoomCode } from "./codes.js";
import { canStart, playersByArrival, type Player, type Room } from "./room.js";
import { maskWord } from "./words.js";

/**
 * The room snapshot sent to clients.
 *
 * The secret word is never part of this payload. Only the drawer and players who have already
 * guessed may see it, and they receive it through a targeted `turn:word` event instead — so
 * there is no viewer-dependent branch here that could leak it by mistake. PRD §12.4.
 */

export interface PublicPlayer {
  id: string;
  name: string;
  avatar_id: string;
  hat_id: string | null;
  score: number;
  connected: boolean;
  ready: boolean;
  guessed_this_turn: boolean;
  is_host: boolean;
}

function toPublicPlayer(player: Player, room: Room): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    avatar_id: player.avatarId,
    hat_id: player.hatId,
    score: player.score,
    connected: player.connected,
    ready: player.ready,
    guessed_this_turn: player.guessedThisTurn,
    is_host: player.id === room.hostId,
  };
}

export function toPublicRoomState(room: Room) {
  const start = canStart(room);
  return {
    code: room.code,
    display_code: formatRoomCode(room.code),
    host_id: room.hostId,
    phase: room.phase,
    settings: {
      decks: [...room.settings.decks],
      // The words themselves stay on the server; the lobby only needs the count.
      custom_word_count: room.settings.customWords.length,
      custom_only: room.settings.customOnly,
      rounds: room.settings.rounds,
      turn_seconds: room.settings.turnSeconds,
      max_players: room.settings.maxPlayers,
      letter_hints: room.settings.letterHints,
      three_word_choice: room.settings.threeWordChoice,
      gentle_spelling: room.settings.gentleSpelling,
      is_private: room.settings.isPrivate,
    },
    players: playersByArrival(room).map((p) => toPublicPlayer(p, room)),
    round: room.round,
    total_rounds: room.settings.rounds,
    drawer_id: room.drawerOrder[room.drawerIndex] ?? null,
    // Blanks plus whatever hints have been given. Safe for everyone — the word itself only
    // ever travels in a targeted `turn:word`.
    word_mask: room.word ? maskWord(room.word, room.revealedIdx) : null,
    word_length: room.word?.length ?? 0,
    ends_at: room.endsAt,
    autostart_at: room.autostartAt,
    can_start: start.ok,
    start_blocked_reason: start.reason,
    server_now: Date.now(),
  };
}

export type PublicRoomState = ReturnType<typeof toPublicRoomState>;

/** The row shown in the public room browser on the home page. */
export function toRoomSummary(room: Room) {
  return {
    code: room.code,
    display_code: formatRoomCode(room.code),
    phase: room.phase,
    player_count: room.players.size,
    max_players: room.settings.maxPlayers,
    round: room.round,
    total_rounds: room.settings.rounds,
  };
}
