// Thuruppu Game Engine — Monte Carlo search tests
import { describe, it, expect } from 'vitest';
import { bestPlayDecision, mulberry32, roundWin } from '../search';
import { getLegalMoves } from '../game';
import type { Card, GameState, PlayerIndex, Suit } from '../types';

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
    const tricks = [
      { cards: [], winner: 0 as PlayerIndex, points: 10 },
      { cards: [], winner: 2 as PlayerIndex, points: 8 },
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
});
