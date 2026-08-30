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
import { createDeck, formatCard, getCardPoints, getRankValue, getTeam } from './cards';

export interface SearchOptions {
  /** Number of sampled hidden deals per candidate move. Default 150. */
  samples?: number;
  /** Injectable RNG (0..1) for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

export interface MoveEvaluation {
  move: LegalMove;
  pMakeContract: number;
  expectedPoints: number;
  label: string;
}

export interface SearchResult {
  move: LegalMove;
  /** Expected card points the team wins over the remaining tricks. */
  expectedPoints: number;
  /** Estimated probability (0..1) that the team makes the bid contract. */
  pMakeContract: number;
  /** Human-readable rationale. */
  reasoning: string;
  /** Per-move evaluation table. */
  moves: MoveEvaluation[];
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
export function sampleDeal(state: GameState, playerIndex: PlayerIndex, rng: () => number): GameState {
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

  // Infer voids the deciding player has observed: a player who played a card
  // that doesn't match the led suit was void in that suit (they must follow
  // suit otherwise). Honor these when filling hidden hands so sampled deals
  // stay consistent with what the player actually knows — this lets the search
  // value "lead my partner's void so they can cut."
  const voidSuits: Suit[][] = [[], [], [], []];
  for (const t of s.tricks) {
    for (const tc of t.cards) {
      if (tc.card.suit !== t.leadSuit) voidSuits[tc.player].push(t.leadSuit);
    }
  }
  if (s.currentTrick.leadSuit) {
    for (const tc of s.currentTrick.cards) {
      if (tc && tc.card.suit !== s.currentTrick.leadSuit) {
        voidSuits[tc.player].push(s.currentTrick.leadSuit);
      }
    }
  }

  // Deal most-constrained players first (most observed voids), so scarce-suit
  // cards go to the players who can still hold them.
  const remaining = shuffled.slice();
  const order = ([0, 1, 2, 3] as PlayerIndex[])
    .filter((p) => p !== playerIndex)
    .sort((a, b) => voidSuits[b].length - voidSuits[a].length);

  for (const p of order) {
    const keepTrump = p === bidder && keepTrumpInBidderHand;
    const need = keepTrump ? s.hands[p].length - 1 : s.hands[p].length;
    const forbidden = new Set(voidSuits[p]);
    const dealt: Card[] = [];
    // Prefer cards from allowed suits…
    for (let i = remaining.length - 1; i >= 0 && dealt.length < need; i--) {
      if (!forbidden.has(remaining[i].suit)) {
        dealt.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }
    // …but never strand a hand short (relax only if the constraints are infeasible).
    while (dealt.length < need && remaining.length > 0) {
      dealt.push(remaining.pop()!);
    }
    s.hands[p] = keepTrump ? [hiddenTrump!, ...dealt] : dealt;
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

/** Whether the current player should reveal trump during the playout.
 *  Contract-aware: only when the trick's points are material (>= 2) and our
 *  team is not already winning it. Fixes the "burn trump early" behavior. */
export function shouldCallTrump(state: GameState, player: PlayerIndex): boolean {
  const placed = state.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
  const pointsAtStake = placed.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
  if (pointsAtStake < 2) return false;
  const winner = currentTrickWinner(state);
  if (winner && getTeam(winner.player) === getTeam(player)) return false;
  return true;
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

/** 1 if `playerIndex`'s team wins the round (makes/breaks the contract), else 0. */
export function roundWin(state: GameState, playerIndex: PlayerIndex): 0 | 1 {
  const bid = state.bid;
  if (!bid) return 0;
  const bidderTeam = getTeam(bid.bidder);
  let biddingTeamPoints = 0;
  for (const t of state.tricks) {
    if (getTeam(t.winner) === bidderTeam) biddingTeamPoints += t.points;
  }
  const madeBid = biddingTeamPoints >= bid.amount;
  const myTeam = getTeam(playerIndex);
  return (myTeam === bidderTeam ? madeBid : !madeBid) ? 1 : 0;
}

/** Play out the round from the given state, returning the team's card points. */
function playout(
  state: GameState,
  playerIndex: PlayerIndex,
): { win: 0 | 1; points: number } {
  let s = cloneState(state);
  let guard = 0;
  while ((s.phase === 'firstPhase' || s.phase === 'secondPhase') && guard < 200) {
    const moves = getLegalMoves(s);
    const playMoves = moves.filter((m) => m.type === 'playCard');
    if (playMoves.length === 0) break;

    const callTrump = moves.find((m) => m.type === 'callTrump');
    let chosen: LegalMove;
    if (callTrump && s.currentTrick.leadSuit !== null) {
      chosen = shouldCallTrump(s, s.currentPlayer) ? callTrump : greedyPlay(s, s.currentPlayer);
    } else {
      chosen = greedyPlay(s, s.currentPlayer);
    }
    s = applyMove(s, chosen);
    guard++;
  }
  return { win: roundWin(s, playerIndex), points: teamPoints(s, playerIndex) };
}

// ─── Move evaluation ────────────────────────────────────────────────

/**
 * "Never gift points" guard: when following a trick (not leading), void in the
 * led suit, and an OPPONENT currently holds the winning card, a point-card
 * discard (J/9/A/10) that cannot win the trick must never outrank a card that
 * gives the trick away cheaply (a zero-point discard, or a card that actually
 * wins). Without this, Monte-Carlo sampling noise lets a 2-point dump beat a
 * 0-point dump essentially at random, gifting the opponents points.
 *
 * Partner-winning tricks are untouched: if a teammate holds the winner, the
 * opponent check fails and point-card fattening stays legal.
 */
function applyNoGiftGuard(
  state: GameState,
  playerIndex: PlayerIndex,
  moves: MoveEvaluation[],
): MoveEvaluation[] {
  const leadSuit = state.currentTrick.leadSuit;
  if (leadSuit === null) return moves;

  const allLegal = getLegalMoves(state);
  const isVoid = !allLegal.some((m) => m.type === 'playCard' && m.card.suit === leadSuit);
  if (!isVoid) return moves;

  const winner = currentTrickWinner(state);
  if (!winner || getTeam(winner.player) === getTeam(playerIndex)) return moves;

  const gifted = moves.filter(
    (m) =>
      m.move.type === 'playCard' &&
      rankPoints((m.move as { card: Card }).card.rank) > 0 &&
      !beatsWinner((m.move as { card: Card }).card, playerIndex, state),
  );
  if (gifted.length === 0) return moves;

  const safe = moves.filter((m) => !gifted.includes(m));
  if (safe.length === 0) return moves;

  const bestSafe = Math.max(...safe.map((m) => m.pMakeContract));
  return moves.map((m) =>
    gifted.includes(m)
      ? { ...m, pMakeContract: Math.min(m.pMakeContract, bestSafe - 1e-3) }
      : m,
  );
}

/** Cards of each suit already played (completed tricks + current trick). */
function playedCountBySuit(state: GameState): Record<Suit, number> {
  const played: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const t of state.tricks) {
    for (const tc of t.cards) played[tc.card.suit]++;
  }
  for (const c of state.currentTrick.cards) {
    if (c) played[c.card.suit]++;
  }
  return played;
}

/**
 * "Cash the Jack first" guard: when LEADING a NEW suit (its first round), a
 * point-bearing card (A/9/10) of that suit must never outrank its Jack. Early
 * in a suit the opponents still hold it and must follow suit, so the Jack
 * (3 pts) wins safely; saving it for a later round lets a now-void opponent cut
 * it with trump.
 *
 * Card-counting: the rule fires only while the suit has never been led and few
 * of its cards are out (<3 played). Once the suit has been led — or opponents
 * have shed most of it as discards — a void opponent can trump the Jack, and
 * the search's own EV must decide. Zero-point probes (7/8/K/Q) are left to the
 * search.
 */
function applyLeadJackFirst(
  state: GameState,
  playerIndex: PlayerIndex,
  moves: MoveEvaluation[],
): MoveEvaluation[] {
  if (state.currentTrick.leadSuit !== null) return moves;

  const ledSuits = new Set<Suit>(state.tricks.map((t) => t.leadSuit));
  const played = playedCountBySuit(state);
  const hand = state.hands[playerIndex];

  const jackScores: Partial<Record<Suit, number>> = {};
  for (const m of moves) {
    if (m.move.type === 'playCard' && m.move.card.rank === 'J') {
      jackScores[m.move.card.suit] = m.pMakeContract;
    }
  }
  if (Object.keys(jackScores).length === 0) return moves;

  const holdsJack = (s: Suit): boolean => hand.some((c) => c.suit === s && c.rank === 'J');

  return moves.map((m) => {
    if (m.move.type !== 'playCard' || m.move.card.rank === 'J') return m;
    const card = m.move.card;
    if (!holdsJack(card.suit) || rankPoints(card.rank) === 0) return m;
    if (ledSuits.has(card.suit) || played[card.suit] >= 3) return m; // later round — let EV decide
    const jackScore = jackScores[card.suit];
    if (jackScore === undefined) return m;
    return { ...m, pMakeContract: jackScore - 1e-3 };
  });
}

function evaluateMove(
  state: GameState,
  playerIndex: PlayerIndex,
  move: LegalMove,
  samples: number,
  rng: () => number,
): { pMakeContract: number; expectedPoints: number } {
  let winTotal = 0;
  let ptsTotal = 0;
  for (let i = 0; i < samples; i++) {
    const deal = sampleDeal(state, playerIndex, rng);
    const next = applyMove(deal, move);
    const { win, points } = playout(next, playerIndex);
    winTotal += win;
    ptsTotal += points;
  }
  return { pMakeContract: winTotal / samples, expectedPoints: ptsTotal / samples };
}

// ─── Public API ─────────────────────────────────────────────────────

function moveLabel(move: LegalMove): string {
  if (move.type === 'callTrump') return 'call trump';
  if (move.type === 'playCard') return `play ${formatCard(move.card)}`;
  return String(move.type);
}

/** Monte-Carlo evaluation of every candidate play/call-trump move. */
export function evaluateMoves(
  state: GameState,
  playerIndex: PlayerIndex,
  options: SearchOptions = {},
): MoveEvaluation[] {
  const samples = options.samples ?? 150;
  const rng = options.rng ?? Math.random;
  const candidates = getLegalMoves(state).filter(
    (m) => m.type === 'playCard' || m.type === 'callTrump',
  );
  const base = candidates.map((move) => {
    const { pMakeContract, expectedPoints } = evaluateMove(state, playerIndex, move, samples, rng);
    return { move, pMakeContract, expectedPoints, label: moveLabel(move) };
  });
  const noGift = applyNoGiftGuard(state, playerIndex, base);
  return applyLeadJackFirst(state, playerIndex, noGift);
}

/**
 * Pick the best play decision for `playerIndex` using Monte-Carlo search.
 *
 * Returns null if the state is not a play phase or there are no play moves.
 * Considers every legal card plus "callTrump" (when legal), and returns the
 * move with the highest probability of making the bid contract.
 */
export function bestPlayDecision(
  state: GameState,
  playerIndex: PlayerIndex,
  options: SearchOptions = {},
): SearchResult | null {
  if (state.phase !== 'firstPhase' && state.phase !== 'secondPhase') return null;
  const moves = evaluateMoves(state, playerIndex, options);
  if (moves.length === 0) return null;
  const best = moves.reduce((a, b) => (b.pMakeContract > a.pMakeContract ? b : a));
  const pct = Math.round(best.pMakeContract * 100);
  const bidAmt = state.bid?.amount ?? '?';
  return {
    move: best.move,
    expectedPoints: best.expectedPoints,
    pMakeContract: best.pMakeContract,
    reasoning: `Search (${options.samples ?? 150} samples) → ${best.label} (${pct}% to make the ${bidAmt}-bid)`,
    moves,
  };
}
