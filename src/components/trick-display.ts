// Pure helpers for rendering a completed trick on the table medallion.

import type { Trick, TrickCard } from '../engine/types';

/**
 * Map a completed trick to the four seat-slot positions on the table.
 * The slot index is the player index, so the card each player played is
 * placed at that player's seat. Any unplayed slot stays null.
 */
export function trickToDisplay(trick: Trick | undefined): (TrickCard | null)[] {
  const slots: (TrickCard | null)[] = [null, null, null, null];
  if (!trick) return slots;
  for (const tc of trick.cards) {
    slots[tc.player] = tc;
  }
  return slots;
}
