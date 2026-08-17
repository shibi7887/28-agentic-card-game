// Thuruppu Game Engine — Monte Carlo search tests
import { describe, it, expect } from 'vitest';
import { bestPlayDecision, evaluateMoves, mulberry32, roundWin, sampleDeal, shouldCallTrump } from '../search';
import { getLegalMoves } from '../game';
import type { Card, GameState, PlayerIndex, Suit, Trick } from '../types';

// Build a minimal, valid play-phase GameState with full control over hands.
function makePlayState(overrides: Partial<GameState> = {}): GameState {
  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];
  return {
    phase: 'secondPhase',
    hands,
    currentPlayer: 0 as PlayerIndex,
    dealer: 0 as PlayerIndex,
    remainingDeck: [],
    tricks: [],
    currentTrick: { cards: [null, null, null, null], leadSuit: null },
    trumpSuit: 'spades',
    hiddenTrumpCard: null,
    trumpCard: null,
    trumpRevealed: true,
    changingTrump: false,
    preRebidBid: null,
    mustPlayTrump: false,
    bid: { amount: 18, bidder: 0 as PlayerIndex },
    bidHistory: [],
    rebidPlayers: [],
    bidderPairShown: false,
    defenderPairShown: false,
    scores: { team0: 0, team1: 0 },
    roundComplete: false,
    roundResult: null,
    winner: null,
    trickNumber: 1,
    trumpLedThisTrick: false,
    passesSinceLastBid: 0,
    ...overrides,
  };
}

describe('Monte Carlo search', () => {
  it('returns a legal move for a play-phase state', () => {
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }],
        [],
        [],
        [],
      ],
      currentTrick: { cards: [null, null, null, null], leadSuit: null },
    });

    const result = bestPlayDecision(state, 0, { samples: 20, rng: mulberry32(42) });
    expect(result).not.toBeNull();
    const legal = getLegalMoves(state);
    const isLegal = legal.some(
      (m) =>
        m.type === result!.move.type &&
        (m.type !== 'playCard' && m.type !== 'selectTrump'
          ? true
          : (m as { card: Card }).card.suit === (result!.move as { card: Card }).card.suit &&
            (m as { card: Card }).card.rank === (result!.move as { card: Card }).card.rank),
    );
    expect(isLegal).toBe(true);
  });

  it('returns null outside play phases', () => {
    const state = makePlayState({ phase: 'bidding' });
    expect(bestPlayDecision(state, 0, { samples: 5, rng: mulberry32(1) })).toBeNull();
  });

  it('is deterministic for a fixed seed', () => {
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }, { suit: 'clubs', rank: '9' }],
        [{ suit: 'diamonds', rank: 'A' }],
        [{ suit: 'hearts', rank: 'A' }],
        [{ suit: 'clubs', rank: 'K' }],
      ],
      currentTrick: { cards: [null, null, null, null], leadSuit: null },
    });

    const a = bestPlayDecision(state, 0, { samples: 30, rng: mulberry32(99) });
    const b = bestPlayDecision(state, 0, { samples: 30, rng: mulberry32(99) });
    expect(a!.move).toEqual(b!.move);
    expect(a!.expectedPoints).toBe(b!.expectedPoints);
  });

  it('cuts an opponent trick with trump when void and holding the trump J', () => {
    // Opponent (P1) leads hearts A; we are void in hearts and hold the J of
    // spades (trump). The search should win the trick with trump rather than
    // dump a low card.
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'diamonds', rank: '7' }],
        [{ suit: 'hearts', rank: 'A' }],
        [{ suit: 'hearts', rank: '7' }],
        [{ suit: 'clubs', rank: '7' }],
      ],
      currentPlayer: 0 as PlayerIndex,
      currentTrick: { cards: [null, { card: { suit: 'hearts', rank: 'A' }, player: 1 }, null, null], leadSuit: 'hearts' },
      trumpSuit: 'spades',
      trumpRevealed: true,
    });

    const result = bestPlayDecision(state, 0, { samples: 30, rng: mulberry32(7) });
    expect(result).not.toBeNull();
    // The chosen move must win the trick with the trump J.
    expect(result!.move.type).toBe('playCard');
    const card = (result!.move as { card: Card }).card;
    expect(card.suit).toBe('spades');
    expect(card.rank).toBe('J');
  });

  it('roundWin scores contract success from the deciding player perspective', () => {
    const tricks: Trick[] = [
      { cards: [], winner: 0, points: 10, leadSuit: 'hearts' },
      { cards: [], winner: 2, points: 8, leadSuit: 'hearts' },
    ];
    const fail = makePlayState({ bid: { amount: 20, bidder: 0 as PlayerIndex }, tricks });
    expect(roundWin(fail, 0)).toBe(0);
    expect(roundWin(fail, 1)).toBe(1);
    expect(roundWin(fail, 3)).toBe(1);
    const win = makePlayState({ bid: { amount: 16, bidder: 0 as PlayerIndex }, tricks });
    expect(roundWin(win, 0)).toBe(1);
    expect(roundWin(win, 2)).toBe(1);
    expect(roundWin(win, 1)).toBe(0);
  });

  it('sampleDeal honors observed voids (never deals a void suit)', () => {
    // P1 discarded 8♠ on a diamond lead → P1 is known void in diamonds.
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }],
        [{ suit: 'clubs', rank: '7' }, { suit: 'clubs', rank: '8' }],
        [{ suit: 'spades', rank: '9' }, { suit: 'spades', rank: '10' }],
        [{ suit: 'hearts', rank: 'K' }, { suit: 'hearts', rank: 'Q' }],
      ],
      tricks: [
        {
          cards: [
            { card: { suit: 'diamonds', rank: '7' }, player: 0 },
            { card: { suit: 'spades', rank: '8' }, player: 1 },
            { card: { suit: 'diamonds', rank: 'K' }, player: 2 },
            { card: { suit: 'diamonds', rank: 'A' }, player: 3 },
          ],
          winner: 2 as PlayerIndex,
          points: 1,
          leadSuit: 'diamonds',
        },
      ],
      currentTrick: { cards: [null, null, null, null], leadSuit: null },
      trumpSuit: 'clubs',
      trumpRevealed: true,
    });

    const rng = mulberry32(2024);
    for (let i = 0; i < 200; i++) {
      const deal = sampleDeal(state, 0, rng);
      expect(deal.hands[1].some((c) => c.suit === 'diamonds')).toBe(false);
    }
  });

  it('bestPlayDecision reports pMakeContract in [0,1] and expectedPoints', () => {
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }, { suit: 'clubs', rank: '9' }],
        [{ suit: 'diamonds', rank: 'A' }],
        [{ suit: 'hearts', rank: 'A' }],
        [{ suit: 'clubs', rank: 'K' }],
      ],
      currentTrick: { cards: [null, null, null, null], leadSuit: null },
    });
    const r = bestPlayDecision(state, 0, { samples: 30, rng: mulberry32(99) });
    expect(r).not.toBeNull();
    expect(r!.pMakeContract).toBeGreaterThanOrEqual(0);
    expect(r!.pMakeContract).toBeLessThanOrEqual(1);
    expect(r!.expectedPoints).toBeGreaterThanOrEqual(0);
  });

  it('shouldCallTrump is contract-aware: skips low-value tricks, calls when material', () => {
    const low = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'diamonds', rank: '7' }],
        [{ suit: 'hearts', rank: 'A' }],
        [{ suit: 'hearts', rank: '7' }],
        [{ suit: 'clubs', rank: '7' }],
      ],
      currentPlayer: 0 as PlayerIndex,
      currentTrick: { cards: [null, { card: { suit: 'hearts', rank: 'A' }, player: 1 }, null, null], leadSuit: 'hearts' },
      trumpSuit: 'spades',
      trumpRevealed: false,
    });
    expect(shouldCallTrump(low, 0)).toBe(false);

    const high = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'diamonds', rank: '7' }],
        [{ suit: 'hearts', rank: 'J' }],
        [{ suit: 'hearts', rank: '7' }],
        [{ suit: 'clubs', rank: '7' }],
      ],
      currentPlayer: 0 as PlayerIndex,
      currentTrick: { cards: [null, { card: { suit: 'hearts', rank: 'J' }, player: 1 }, null, null], leadSuit: 'hearts' },
      trumpSuit: 'spades',
      trumpRevealed: false,
    });
    expect(shouldCallTrump(high, 0)).toBe(true);
  });

  it('evaluateMoves returns one entry per candidate with a label', () => {
    const state = makePlayState({
      hands: [
        [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }],
        [], [], [],
      ],
      currentTrick: { cards: [null, null, null, null], leadSuit: null },
    });
    const moves = evaluateMoves(state, 0, { samples: 10, rng: mulberry32(42) });
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.pMakeContract).toBeGreaterThanOrEqual(0);
      expect(m.pMakeContract).toBeLessThanOrEqual(1);
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
    }
  });
});
