// Thuruppu Game Engine — Deterministic opening-bid evaluation
//
// The AI must not bid recklessly with only 4 cards in hand. This module
// computes a conservative maximum opening bid from hand strength, so the
// LLM cannot over-commit before the second deal and the rebid phase.

import type { Card, Rank, LegalMove } from './types';
import { ALL_SUITS, countPoints } from './cards';

// Control weight per rank: reflects both point value and trick-taking power.
const CONTROL: Record<Rank, number> = {
  J: 4, '9': 3, A: 2, '10': 1, K: 0, Q: 0, '8': 0, '7': 0,
};

export interface OpeningHandEvaluation {
  maxBid: number;   // highest sensible opening bid (14–18)
  points: number;   // raw point total of the 4-card hand
  score: number;    // internal strength score used to derive maxBid
  note: string;     // human-readable rationale
}

/**
 * Evaluate a 4-card opening hand and return the conservative max bid.
 *
 * Score = raw points + bonuses for:
 *  - holding both J and 9 of the same suit (strong trump signal)  +2
 *  - 3+ cards of a single suit (length / trump depth)             +1/+2
 *  - two or more Jacks                                            +2
 *
 * Score → maxBid:
 *   ≤4 → 14, ≤8 → 15, ≤10 → 16, ≤12 → 17, else → 18
 */
export function evaluateOpeningHand(hand: Card[]): OpeningHandEvaluation {
  const points = countPoints(hand);

  const j9Bonus = ALL_SUITS.some(
    (s) => hand.some((c) => c.suit === s && c.rank === 'J') &&
           hand.some((c) => c.suit === s && c.rank === '9'),
  )
    ? 2
    : 0;

  const maxLen = ALL_SUITS.reduce(
    (best, s) => Math.max(best, hand.filter((c) => c.suit === s).length),
    0,
  );
  // bonus for 3+ cards of a single suit (trump depth)
  const lengthBonus = maxLen >= 4 ? 3 : maxLen === 3 ? 2 : 0;
  // bonus for a perfect 4-card suit with (J, 9)
  const perfectSuitBonus = ALL_SUITS.some(
    (s) => hand.filter((c) => c.suit === s).length === 4 &&
           hand.some((c) => c.suit === s && c.rank === 'J') &&
           hand.some((c) => c.suit === s && c.rank === '9'),
  )
    ? 2
    : 0;

  const jackCount = hand.filter((c) => c.rank === 'J').length;
  const jackBonus = jackCount >= 2 ? 2 : 0;

  const score = points + j9Bonus + lengthBonus + jackBonus + perfectSuitBonus;

  let maxBid: number;
  let note: string;
  if (score <= 4) {
    maxBid = 14;
    note = 'Weak opening hand — bid the minimum or pass.';
  } else if (score <= 8) {
    maxBid = 15;
    note = 'Moderate hand — a modest raise is acceptable.';
  } else if (score <= 10) {
    maxBid = 16;
    note = 'Strong hand with suit structure — 16 is the ceiling.';
  } else if (score <= 12) {
    maxBid = 18;
    note = 'Very strong hand — 17 only with exceptional 4-card strength.';
  } else {
    maxBid = 20;
    note = 'Exceptional hand — 18 is the maximum opening bid.';
  }

  return { maxBid, points, score, note };
}

export interface RebidHandEvaluation {
  maxRebid: number;  // highest sensible rebid (24–28); 22 means "pass — do not rebid"
  points: number;    // raw point total of the 8-card hand
  score: number;     // internal strength score
  note: string;      // human-readable rationale
}

/**
 * Evaluate the full 8-card hand for the REBID phase (raising to 24+).
 *
 * Unlike the opening bid (capped at 18), a rebid can reach 28. But a 24+
 * bid is a "Thani / solo" contract — the bidding team must capture nearly
 * every one of the 28 points. That demands strength concentrated in 1–2
 * suits (a real trump suit), NOT points scattered across all four suits.
 * A balanced hand has almost no chance of making 24.
 *
 * Score = raw points + bonuses for suit length (trump depth), J+9 trump
 * pairs, and holding multiple jacks. Score → maxRebid:
 *   <16 → 22 (pass), <18 → 24, <20 → 26, else → 28
 */
export function evaluateRebidHand(hand: Card[]): RebidHandEvaluation {
  const points = countPoints(hand);

  const longestLen = ALL_SUITS.reduce(
    (best, s) => Math.max(best, hand.filter((c) => c.suit === s).length),
    0,
  );
  const lengthBonus = longestLen >= 5 ? 3 : longestLen === 4 ? 1 : 0;

  const j9Pairs = ALL_SUITS.filter(
    (s) => hand.some((c) => c.suit === s && c.rank === 'J') &&
           hand.some((c) => c.suit === s && c.rank === '9'),
  ).length;
  const j9Bonus = 2 * j9Pairs;

  const jackCount = hand.filter((c) => c.rank === 'J').length;
  const jackBonus = jackCount >= 2 ? 1 : 0;

  const score = points + lengthBonus + j9Bonus + jackBonus;

  let maxRebid: number;
  let note: string;
  if (score < 16) {
    maxRebid = 22;
    note = 'Balanced or point-light hand — pass the rebid; a 24+ will fail.';
  } else if (score < 18) {
    maxRebid = 24;
    note = 'Strong concentrated hand — 24 is defensible.';
  } else if (score < 20) {
    maxRebid = 26;
    note = 'Very strong hand — 26 only with near-solo strength.';
  } else {
    maxRebid = 28;
    note = 'Exceptional solo hand — 28 is on the table.';
  }

  return { maxRebid, points, score, note };
}

/**
 * Highest legal bid amount at or below `cap`, or null if none exists.
 */
export function chooseMaxLegalBid(moves: LegalMove[], cap: number): number | null {
  let best: number | null = null;
  for (const m of moves) {
    if (m.type === 'bid' && m.amount <= cap) {
      best = best === null ? m.amount : Math.max(best, m.amount);
    }
  }
  return best;
}
