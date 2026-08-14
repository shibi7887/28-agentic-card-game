// Thuruppu Game Engine — Monte Carlo card-play search
//
// 28 is tiny (32 cards, 8 tricks, imperfect information), so we can do what
// the LLM cannot: enumerate the hidden cards, sample many possible deals,
// and greedily play out each one to estimate which card wins the most points
// for our team. This is dramatically faster and more reliable than asking an
// LLM to reason about card play, and it never produces an illegal move.
//
// The search is "double-dummy" in spirit: during planning we assume the trump
// suit is known (the engine knows it) and that future tricks can be cut with
// trump. The move actually returned still obeys the real Phase 1/2 rules via
// the engine's own getLegalMoves / applyMove.

import type { Card, GameState, LegalMove, PlayerIndex, Rank, Suit, TrickCard } from './types';
import { getLegalMoves, applyMove, getTrickWinner } from './game';
import { createDeck, getCardPoints, getRankValue, getTeam } from './cards';

export interface SearchOptions {
  /** Number of sampled hidden deals per candidate move. Default 150. */
  samples?: number;
  /** Injectable RNG (0..1) for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

export interface SearchResult {
  move: LegalMove;
  /** Expected card points the team wins over the remaining tricks. */
  expectedPoints: number;
  /** Human-readable rationale. */
  reasoning: string;
}

// ─── RNG ────────────────────────────────────────────────────────────

/** Deterministic 32-bit PRNG (mulberry32) for reproducible tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Cloning ────────────────────────────────────────────────────────

function cloneState(state: GameState): GameState {
  return {
    ...state,
    hands: state.hands.map((h) => [...h]) as GameState['hands'],
    remainingDeck: [...state.remainingDeck],
    tricks: state.tricks.map((t) => ({ ...t, cards: [...t.cards] })),
    currentTrick: { cards: [...state.currentTrick.cards], leadSuit: state.currentTrick.leadSuit },
    bidHistory: [...state.bidHistory],
    rebidPlayers: [...state.rebidPlayers],
    scores: { ...state.scores },
    roundResult: state.roundResult ? { ...state.roundResult } : null,
  };
}

function cardKey(c: Card): string {
  return `${c.suit}:${c.rank}`;
}

// ─── Sampling the hidden deal ───────────────────────────────────────

/**
 * Produce a full-deal clone where the three OTHER players' hands are filled
 * with a random distribution of the cards the deciding player cannot see
 * (everything except their own hand and the cards already played).
 *
 * The hidden trump card (Phase 1) is kept in the bidder's hand so the
 * engine's own rules keep working during the playout.
 */
function sampleDeal(state: GameState, playerIndex: PlayerIndex, rng: () => number): GameState {
  const s = cloneState(state);

  const known = new Set<string>();
  for (const c of s.hands[playerIndex]) known.add(cardKey(c));
  for (const t of s.tricks) for (const tc of t.cards) known.add(cardKey(tc.card));
  for (const c of s.currentTrick.cards) if (c) known.add(cardKey(c.card));

  const hiddenTrump = s.hiddenTrumpCard;
  const bidder = s.bid?.bidder;
  const keepTrumpInBidderHand =
    hiddenTrump && bidder !== undefined && bidder !== playerIndex && !s.trumpRevealed;

  // Cards unknown to the deciding player (minus the hidden trump card, which
  // must stay put in the bidder's hand).
  let pool = createDeck().filter((c) => !known.has(cardKey(c)));
  if (keepTrumpInBidderHand) {
    pool = pool.filter((c) => !(c.suit === hiddenTrump!.suit && c.rank === hiddenTrump!.rank));
  }
  const shuffled = shuffle(pool, rng);

  let idx = 0;
  for (let p = 0 as PlayerIndex; p < 4; p = (p + 1) as PlayerIndex) {
    if (p === playerIndex) continue;
    const n = s.hands[p].length;
    if (p === bidder && keepTrumpInBidderHand) {
      // Keep the hidden trump card in the bidder's hand; fill the rest randomly.
      s.hands[p] = [hiddenTrump!, ...shuffled.slice(idx, idx + n - 1)];
      idx += n - 1;
    } else {
      s.hands[p] = shuffled.slice(idx, idx + n);
      idx += n;
    }
  }

  return s;
}

// ─── Greedy playout policy ──────────────────────────────────────────

function rankValue(rank: Rank): number {
  return getRankValue(rank);
}

function lowestRank(cards: Card[]): Card {
  return [...cards].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
}

function rankPoints(rank: Rank): number {
  return rank === 'J' ? 3 : rank === '9' ? 2 : rank === 'A' || rank === '10' ? 1 : 0;
}

function lowestPoint(cards: Card[]): Card {
  return [...cards].sort(
    (a, b) => rankPoints(a.rank) - rankPoints(b.rank) || rankValue(a.rank) - rankValue(b.rank),
  )[0];
}

/** The currently winning card among the cards already in the current trick. */
function currentTrickWinner(state: GameState): TrickCard | null {
  const placed = state.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
  if (placed.length === 0) return null;
  const leadSuit = state.currentTrick.leadSuit!;
  const winnerIdx = getTrickWinner(placed, leadSuit, state.trumpSuit, state.trumpRevealed);
  return placed.find((c) => c.player === winnerIdx) ?? null;
}

/** Does `card` beat the current trick winner, given the lead suit and trump? */
function beatsWinner(
  card: Card,
  player: PlayerIndex,
  state: GameState,
): boolean {
  const placed = state.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
  const leadSuit = state.currentTrick.leadSuit!;
  const all = [...placed, { card, player }];
  return getTrickWinner(all, leadSuit, state.trumpSuit, state.trumpRevealed) === player;
}

/**
 * Greedy card choice for a single player during the playout. This is a simple
 * "win the trick cheaply, otherwise dump low" policy — imperfect, but the
 * Monte-Carlo averaging over many sampled deals makes it a strong estimator.
 */
function greedyPlay(state: GameState, player: PlayerIndex): LegalMove {
  const moves = getLegalMoves(state).filter((m) => m.type === 'playCard') as {
    type: 'playCard';
    card: Card;
  }[];
  // Only ever choose among LEGAL cards — never pick straight from the raw hand,
  // otherwise the playout can produce an illegal move and crash the search.
  const legal = moves.map((m) => m.card);
  const leadSuit = state.currentTrick.leadSuit;
  const trump = state.trumpSuit;
  const trumpActive = state.trumpRevealed && trump !== null;

  if (leadSuit === null) {
    // Leading — dump the least valuable legal card (prefer non-trump suits).
    const nonTrump = legal.filter((c) => c.suit !== trump);
    return { type: 'playCard', card: lowestPoint(nonTrump.length ? nonTrump : legal) };
  }

  const followers = legal.filter((c) => c.suit === leadSuit);
  if (followers.length > 0) {
    // Must follow suit. Play the lowest card that still wins, else lowest card.
    const winning = followers.filter((c) => beatsWinner(c, player, state));
    return { type: 'playCard', card: lowestRank(winning.length ? winning : followers) };
  }

  // Void. Trump to win if possible; otherwise dump the lowest point card.
  const myTrumps = trumpActive ? legal.filter((c) => c.suit === trump) : [];
  if (myTrumps.length > 0) {
    const winningTrump = myTrumps.filter((c) => beatsWinner(c, player, state));
    if (winningTrump.length > 0) {
      return { type: 'playCard', card: lowestRank(winningTrump) };
    }
    // Trump cannot win — dump the least valuable legal card instead.
    return { type: 'playCard', card: lowestPoint(legal) };
  }

  return { type: 'playCard', card: lowestPoint(legal) };
}

/** Team card points won across completed tricks. */
function teamPoints(state: GameState, playerIndex: PlayerIndex): number {
  const team = getTeam(playerIndex);
  let pts = 0;
  for (const t of state.tricks) {
    if (getTeam(t.winner) === team) pts += t.points;
  }
  return pts;
}

/** Play out the round from the given state, returning the team's card points. */
function playout(state: GameState, playerIndex: PlayerIndex): number {
  let s = cloneState(state);
  let guard = 0;
  while ((s.phase === 'firstPhase' || s.phase === 'secondPhase') && guard < 200) {
    const moves = getLegalMoves(s);
    const playMoves = moves.filter((m) => m.type === 'playCard');
    if (playMoves.length === 0) break;

    const callTrump = moves.find((m) => m.type === 'callTrump');
    let chosen: LegalMove;
    if (callTrump && s.currentTrick.leadSuit !== null) {
      // If we can cut a point-bearing trick with trump, prefer calling trump.
      const placed = s.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
      const pointsAtStake = placed.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
      if (pointsAtStake > 0) {
        chosen = callTrump;
      } else {
        chosen = greedyPlay(s, s.currentPlayer);
      }
    } else {
      chosen = greedyPlay(s, s.currentPlayer);
    }
    s = applyMove(s, chosen);
    guard++;
  }
  return teamPoints(s, playerIndex);
}

// ─── Move evaluation ────────────────────────────────────────────────

function evaluateMove(
  state: GameState,
  playerIndex: PlayerIndex,
  move: LegalMove,
  samples: number,
  rng: () => number,
): number {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const deal = sampleDeal(state, playerIndex, rng);
    const next = applyMove(deal, move);
    total += playout(next, playerIndex);
  }
  return total / samples;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Pick the best play decision for `playerIndex` using Monte-Carlo search.
 *
 * Returns null if the state is not a play phase or there are no play moves.
 * Considers every legal card plus "callTrump" (when legal), and returns the
 * move with the highest expected team card points.
 */
export function bestPlayDecision(
  state: GameState,
  playerIndex: PlayerIndex,
  options: SearchOptions = {},
): SearchResult | null {
  if (state.phase !== 'firstPhase' && state.phase !== 'secondPhase') return null;

  const samples = options.samples ?? 150;
  const rng = options.rng ?? Math.random;

  const moves = getLegalMoves(state);
  const candidates: LegalMove[] = moves.filter(
    (m) => m.type === 'playCard' || m.type === 'callTrump',
  );
  if (candidates.length === 0) return null;

  let best: LegalMove = candidates[0];
  let bestScore = -Infinity;
  for (const move of candidates) {
    const score = evaluateMove(state, playerIndex, move, samples, rng);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  const label =
    best.type === 'callTrump'
      ? 'call trump'
      : best.type === 'playCard'
        ? `play ${best.card.rank}${best.card.suit}`
        : String(best.type);
  return {
    move: best,
    expectedPoints: bestScore,
    reasoning: `Search (${samples} samples) → ${label} (expected ${bestScore.toFixed(1)} pts)`,
  };
}
