import type { PlayerIndex } from "@/engine/types";

export type SeatPosition = "north" | "south" | "east" | "west";

export interface SeatMeta {
  position: SeatPosition;
  name: string;
  role: "you" | "partner" | "opponent";
  team: 0 | 1;
}

/**
 * Seating around the diamond (counter-clockwise from South):
 *   P0 = South — the human
 *   P1 = East  — Krishnan (opponent)
 *   P2 = North — Raman (partner)
 *   P3 = West  — Kunjappu (opponent)
 */
export const SEATS: Record<PlayerIndex, SeatMeta> = {
  0: { position: "south", name: "You", role: "you", team: 0 },
  1: { position: "east", name: "Krishnan", role: "opponent", team: 1 },
  2: { position: "north", name: "Raman", role: "partner", team: 0 },
  3: { position: "west", name: "Kunjappu", role: "opponent", team: 1 },
};

export const PLAYER_ORDER: PlayerIndex[] = [0, 1, 2, 3];

export const TEAM_NAMES: Record<0 | 1, string> = {
  0: "Your Team",
  1: "Opponents",
};
