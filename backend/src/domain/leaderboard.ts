import type { LeaderboardEntry } from "./models.js";
import { emptyScore, type Room } from "./room.js";

/**
 * Rank players (including any who were promoted to host) by points (desc), then cumulative response time (asc).
 * Players with equal points share a rank; `tie` flags non-zero shared scores.
 */
export function buildLeaderboard(room: Room): LeaderboardEntry[] {
  const competitors = [
    ...[...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })),
    ...[...room.departedPlayers].map(([id, p]) => ({ id, nickname: p.nickname })),
  ];
  const entries = competitors.map((p) => {
    const s = room.scores.get(p.id) ?? emptyScore();
    return {
      player_id: p.id,
      nickname: p.nickname,
      points: s.points,
      streak: s.streak,
      cumulative_time: s.cumulative_time,
      rank: 0,
      tie: false,
    };
  });
  entries.sort((a, b) => b.points - a.points || a.cumulative_time - b.cumulative_time);

  let prevPoints: number | null = null;
  let rank = 0;
  entries.forEach((e, i) => {
    if (e.points !== prevPoints) {
      rank = i + 1;
      prevPoints = e.points;
    }
    e.rank = rank;
  });

  const countByPoints = new Map<number, number>();
  for (const e of entries) countByPoints.set(e.points, (countByPoints.get(e.points) ?? 0) + 1);
  for (const e of entries) e.tie = (countByPoints.get(e.points) ?? 0) > 1 && e.points > 0;

  return entries;
}
