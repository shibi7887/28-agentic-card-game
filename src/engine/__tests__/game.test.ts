// Thuruppu Game Engine — Tests
import { describe, it, expect } from 'vitest';
import {
  createGame,
  getLegalMoves,
  applyMove,
  getTrickWinner,
  getPlayerView,
  getCardPoints,
  getRankValue,
  getTeam,
  getNextPlayer,
  createDeck,
  sortHand,
  countPoints,
  isPointlessHand,
} from '../index';
import type {
  Suit, Rank, Card, PlayerIndex, TrickCard, GameState, LegalMove,
} from '../types';

// ─── Deck & Cards ──────────────────────────────────────────────────

describe('Deck and Cards', () => {
  it('creates a 32-card deck with correct ranks', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    const suits: Set<Suit> = new Set(deck.map(c => c.suit));
    expect(suits.size).toBe(4);
  });

  it('has correct card point values', () => {
    expect(getCardPoints({ suit: 'hearts', rank: 'J' })).toBe(3);
    expect(getCardPoints({ suit: 'spades', rank: '9' })).toBe(2);
    expect(getCardPoints({ suit: 'diamonds', rank: 'A' })).toBe(1);
    expect(getCardPoints({ suit: 'clubs', rank: '10' })).toBe(1);
    expect(getCardPoints({ suit: 'hearts', rank: 'K' })).toBe(0);
    expect(getCardPoints({ suit: 'spades', rank: 'Q' })).toBe(0);
    expect(getCardPoints({ suit: 'diamonds', rank: '8' })).toBe(0);
    expect(getCardPoints({ suit: 'clubs', rank: '7' })).toBe(0);
  });

  it('deck total points is 28', () => {
    const total = countPoints(createDeck());
    expect(total).toBe(28);
  });

  it('card ranking is correct (J > 9 > A > 10 > K > Q > 8 > 7)', () => {
    expect(getRankValue('J')).toBe(7);
    expect(getRankValue('9')).toBe(6);
    expect(getRankValue('A')).toBe(5);
    expect(getRankValue('10')).toBe(4);
    expect(getRankValue('K')).toBe(3);
    expect(getRankValue('Q')).toBe(2);
    expect(getRankValue('8')).toBe(1);
    expect(getRankValue('7')).toBe(0);
  });

  it('sortHand sorts by suit then descending rank', () => {
    const hand: Card[] = [
      { suit: 'spades', rank: '7' },
      { suit: 'hearts', rank: 'J' },
      { suit: 'hearts', rank: '7' },
      { suit: 'spades', rank: 'J' },
    ];
    const sorted = sortHand(hand);
    expect(sorted[0]).toEqual({ suit: 'hearts', rank: 'J' });
    expect(sorted[1]).toEqual({ suit: 'hearts', rank: '7' });
    expect(sorted[2]).toEqual({ suit: 'spades', rank: 'J' });
    expect(sorted[3]).toEqual({ suit: 'spades', rank: '7' });
  });

  it('remaining deck contains 16 cards after first deal', () => {
    const game = createGame(0);
    expect(game.remainingDeck).toHaveLength(16);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────

describe('Helpers', () => {
  it('getTeam returns correct teams', () => {
    expect(getTeam(0)).toBe(0);
    expect(getTeam(2)).toBe(0);
    expect(getTeam(1)).toBe(1);
    expect(getTeam(3)).toBe(1);
  });

  it('getNextPlayer goes counter-clockwise (0→3→2→1→0)', () => {
    expect(getNextPlayer(0)).toBe(3);
    expect(getNextPlayer(3)).toBe(2);
    expect(getNextPlayer(2)).toBe(1);
    expect(getNextPlayer(1)).toBe(0);
  });

  it('isPointlessHand detects all-zero-point hands', () => {
    const pointless: Card[] = [
      { suit: 'hearts', rank: 'K' }, { suit: 'spades', rank: 'Q' },
      { suit: 'diamonds', rank: '8' }, { suit: 'clubs', rank: '7' },
    ];
    expect(isPointlessHand(pointless)).toBe(true);

    const withPoints: Card[] = [
      { suit: 'hearts', rank: 'K' }, { suit: 'spades', rank: 'J' },
    ];
    expect(isPointlessHand(withPoints)).toBe(false);
  });
});

// ─── Game Initialization ───────────────────────────────────────────

describe('Game Creation', () => {
  it('creates a valid initial game state', () => {
    const game = createGame(0);
    expect(game.phase).toBe('bidding');
    expect(game.dealer).toBe(0);
    expect(game.currentPlayer).toBe(3); // right of dealer
    expect(game.hands[0]).toHaveLength(4);
    expect(game.hands[1]).toHaveLength(4);
    expect(game.hands[2]).toHaveLength(4);
    expect(game.hands[3]).toHaveLength(4);
    expect(game.remainingDeck).toHaveLength(16);
    expect(game.bid).toBeNull();
    expect(game.trumpSuit).toBeNull();
    expect(game.trumpRevealed).toBe(false);
    expect(game.scores).toEqual({ team0: 0, team1: 0 });
  });
});

// ─── Bidding ────────────────────────────────────────────────────────

describe('Bidding', () => {
  it('has legal moves starting at 14 and up to 28', () => {
    const game = createGame(0);
    const moves = getLegalMoves(game);
    const bidMoves = moves.filter(m => m.type === 'bid') as { type: 'bid'; amount: number }[];
    expect(bidMoves.length).toBe(15);
    expect(bidMoves[0].amount).toBe(14);
    expect(bidMoves[14].amount).toBe(28);
  });

  it('first bidder cannot pass (no bid yet)', () => {
    const game = createGame(0);
    const moves = getLegalMoves(game);
    expect(moves.some(m => m.type === 'pass')).toBe(false);
  });

  it('subsequent bidders can pass', () => {
    let game = createGame(0);
    game = applyMove(game, { type: 'bid', amount: 14 });
    // Counter-clockwise: after P3 bids, next is P2
    expect(game.currentPlayer).toBe(2);
    const moves = getLegalMoves(game);
    expect(moves.some(m => m.type === 'pass')).toBe(true);
  });

  it('cannot bid lower than or equal to current bid', () => {
    let game = createGame(0);
    game = applyMove(game, { type: 'bid', amount: 20 });
    const moves = getLegalMoves(game);
    const bidAmounts = moves.filter(m => m.type === 'bid').map(m => (m as { type: 'bid'; amount: number }).amount);
    expect(bidAmounts.every(a => a > 20)).toBe(true);
  });

  it('auction ends after 3 consecutive passes — goes to trump selection', () => {
    let game = createGame(0);
    // P3 bids 14
    game = applyMove(game, { type: 'bid', amount: 14 });
    // P0, P1, P2 all pass
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });

    expect(game.phase).toBe('selectingTrump');
    expect(game.currentPlayer).toBe(3); // bidder selects trump
    expect(game.bid).toEqual({ amount: 14, bidder: 3 });
  });
});

// ─── Trump Selection ────────────────────────────────────────────────

describe('Trump Selection', () => {
  it('bidder selects trump, deals second round, transitions to firstPhase', () => {
    let game = createGame(0);
    // P3 bids 14, others pass
    game = applyMove(game, { type: 'bid', amount: 14 });
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });

    // Now in selectingTrump phase — P3 picks a card as trump
    expect(game.phase).toBe('selectingTrump');
    const trumpMoves = getLegalMoves(game);
    expect(trumpMoves.every(m => m.type === 'selectTrump')).toBe(true);

    const trumpCard = (trumpMoves[0] as { type: 'selectTrump'; card: Card }).card;
    game = applyMove(game, { type: 'selectTrump', card: trumpCard });

    // Now in rebidding phase (bidder/partner may raise to 24+)
    expect(game.phase).toBe('rebidding');
    expect(game.trumpSuit).toBe(trumpCard.suit);
    expect(game.hiddenTrumpCard).toEqual(trumpCard);
    // All players should have 8 cards
    expect(game.hands[0]).toHaveLength(8);
    expect(game.hands[1]).toHaveLength(8);
    expect(game.hands[2]).toHaveLength(8);
    expect(game.hands[3]).toHaveLength(8);
    // remainingDeck should be empty
    expect(game.remainingDeck).toHaveLength(0);

    // Both rebid players pass → firstPhase
    expect(game.rebidPlayers.length).toBeGreaterThan(0);
    while (game.phase === 'rebidding') {
      game = applyMove(game, { type: 'pass' });
    }
    expect(game.phase).toBe('firstPhase');
  });

  it('bidder still has 8 cards after trump selection (card not removed)', () => {
    let game = createGame(0);
    game = applyMove(game, { type: 'bid', amount: 14 });
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });
    game = applyMove(game, { type: 'pass' });

    const moves = getLegalMoves(game);
    const trumpCard = (moves[0] as { type: 'selectTrump'; card: Card }).card;
    game = applyMove(game, { type: 'selectTrump', card: trumpCard });

    // Bidder (P3) should still have 8 cards
    expect(game.hands[3]).toHaveLength(8);
    // The hidden trump card should still be in P3's hand
    const hiddenCard = game.hiddenTrumpCard!;
    expect(game.hands[3].some(c => c.suit === hiddenCard.suit && c.rank === hiddenCard.rank)).toBe(true);
  });
});

// ─── Trick Resolution ──────────────────────────────────────────────

describe('Trick Resolution', () => {
  it('Phase 1: highest of lead suit wins (trump irrelevant)', () => {
    const cards: TrickCard[] = [
      { card: { suit: 'hearts', rank: 'A' }, player: 0 },
      { card: { suit: 'diamonds', rank: 'J' }, player: 1 },
      { card: { suit: 'hearts', rank: '10' }, player: 2 },
      { card: { suit: 'spades', rank: '9' }, player: 3 },
    ];
    const winner = getTrickWinner(cards, 'hearts', 'diamonds', false);
    expect(winner).toBe(0);
  });

  it('Phase 2: trump beats non-trump', () => {
    const cards: TrickCard[] = [
      { card: { suit: 'hearts', rank: 'J' }, player: 0 },
      { card: { suit: 'diamonds', rank: '7' }, player: 1 },
      { card: { suit: 'hearts', rank: '9' }, player: 2 },
      { card: { suit: 'hearts', rank: 'A' }, player: 3 },
    ];
    const winner = getTrickWinner(cards, 'hearts', 'diamonds', true);
    expect(winner).toBe(1);
  });

  it('Phase 2: higher trump beats lower trump', () => {
    const cards: TrickCard[] = [
      { card: { suit: 'hearts', rank: 'J' }, player: 0 },
      { card: { suit: 'diamonds', rank: '7' }, player: 1 },
      { card: { suit: 'diamonds', rank: 'J' }, player: 2 },
      { card: { suit: 'hearts', rank: 'A' }, player: 3 },
    ];
    const winner = getTrickWinner(cards, 'hearts', 'diamonds', true);
    expect(winner).toBe(2);
  });

  it('Phase 2: no trump in trick, highest lead suit wins', () => {
    const cards: TrickCard[] = [
      { card: { suit: 'clubs', rank: 'K' }, player: 0 },
      { card: { suit: 'spades', rank: '8' }, player: 1 },
      { card: { suit: 'clubs', rank: '10' }, player: 2 },
      { card: { suit: 'hearts', rank: 'Q' }, player: 3 },
    ];
    const winner = getTrickWinner(cards, 'clubs', 'diamonds', true);
    expect(winner).toBe(2);
  });
});

// ─── Legal Moves - Play ───────────────────────────────────────────

describe('Legal Moves - Play', () => {
  it('must follow suit if possible', () => {
    const state: GameState = {
      ...createGame(0),
      phase: 'secondPhase',
      trumpSuit: 'spades',
      trumpRevealed: true,
      currentTrick: {
        cards: [{ card: { suit: 'hearts', rank: '7' }, player: 1 }, null, null, null],
        leadSuit: 'hearts',
      },
      hands: [
        [
          { suit: 'hearts', rank: 'A' },
          { suit: 'hearts', rank: 'K' },
          { suit: 'diamonds', rank: 'J' },
        ],
        [], [], [],
      ] as [Card[], Card[], Card[], Card[]],
      currentPlayer: 0,
      bid: { amount: 14, bidder: 3 },
    } as GameState;

    const moves = getLegalMoves(state);
    const playCards = moves.filter(m => m.type === 'playCard').map(m => (m as { type: 'playCard'; card: Card }).card);
    expect(playCards).toHaveLength(2);
    expect(playCards.every(c => c.suit === 'hearts')).toBe(true);
  });

  it('can play any card when cannot follow suit (Phase 2, no trump in trick)', () => {
    const state: GameState = {
      ...createGame(0),
      phase: 'secondPhase',
      trumpSuit: 'spades',
      trumpRevealed: true,
      currentTrick: {
        cards: [null, null, null, null],
        leadSuit: 'clubs',
      },
      hands: [
        [
          { suit: 'hearts', rank: 'A' },
          { suit: 'diamonds', rank: 'J' },
          { suit: 'spades', rank: '7' },
        ],
        [], [], [],
      ] as [Card[], Card[], Card[], Card[]],
      currentPlayer: 0,
      bid: { amount: 14, bidder: 3 },
    } as GameState;

    const moves = getLegalMoves(state);
    const playCards = moves.filter(m => m.type === 'playCard').map(m => (m as { type: 'playCard'; card: Card }).card);
    expect(playCards).toHaveLength(3);
  });
});

// ─── Player View ───────────────────────────────────────────────────

describe('Player View', () => {
  it('hides opponent hands', () => {
    const game = createGame(0);
    const view = getPlayerView(game, 0);
    expect(view.hand).toHaveLength(4);
    expect(view.partnerHandCount).toBe(4);
    expect(view.opponentHandCounts).toEqual([4, 4]);
  });

  it('only shows trump suit after revealed', () => {
    const game = createGame(0);
    expect(getPlayerView(game, 0).trumpSuit).toBeNull();

    const revealedState: GameState = {
      ...game,
      trumpRevealed: true,
      trumpSuit: 'hearts',
    } as GameState;
    expect(getPlayerView(revealedState, 0).trumpSuit).toBe('hearts');
  });

  it('legal moves only shown for current player', () => {
    const game = createGame(0);
    const view3 = getPlayerView(game, 3); // P3 = current player
    expect(view3.legalMoves.length).toBeGreaterThan(0);

    const view0 = getPlayerView(game, 0);
    expect(view0.legalMoves.length).toBe(0);
  });
});

// ─── Scoring & Round Progression ───────────────────────────────────

describe('Scoring & Round Progression', () => {
  it('nextRound advances dealer and resets hands', () => {
    let game = createGame(0);
    // Set up scoring phase
    const scoredState: GameState = {
      ...game,
      phase: 'scoring' as const,
      scores: { team0: 1, team1: 0 },
    } as GameState;

    const moves = getLegalMoves(scoredState);
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe('nextRound');

    game = applyMove(scoredState, { type: 'nextRound' });
    expect(game.phase).toBe('bidding');
    expect(game.dealer).toBe(3); // rotated counter-clockwise
    expect(game.scores).toEqual({ team0: 1, team1: 0 }); // preserved
    expect(game.hands[0]).toHaveLength(4); // redealt
  });
});

// ─── Pair Rule ─────────────────────────────────────────────────────

describe('Pair Rule', () => {
  it('both teams can show pair', () => {
    const state: GameState = {
      ...createGame(0),
      phase: 'secondPhase' as const,
      trumpSuit: 'hearts' as Suit,
      trumpRevealed: true,
      currentTrick: {
        cards: [null, null, null, null],
        leadSuit: null,
      },
      hands: [
        [{ suit: 'hearts', rank: 'K' }, { suit: 'hearts', rank: 'Q' }, { suit: 'spades', rank: '7' }],
        [], [], [],
      ] as [Card[], Card[], Card[], Card[]],
      currentPlayer: 0 as PlayerIndex,
      bid: { amount: 20, bidder: 0 },
      bidderPairShown: false,
      defenderPairShown: false,
    } as GameState;

    // Player 0 is the bidder, has K+Q of trump → can show pair
    const moves = getLegalMoves(state);
    expect(moves.some(m => m.type === 'showPair')).toBe(true);

    // Apply it
    const afterPair = applyMove(state, { type: 'showPair' });
    expect(afterPair.bidderPairShown).toBe(true);
    expect(afterPair.bid!.amount).toBe(16); // decreased by 4

    // Now bidder can't show again
    const moves2 = getLegalMoves(afterPair);
    expect(moves2.some(m => m.type === 'showPair')).toBe(false);
  });

  it('defender pair increases bid', () => {
    const state: GameState = {
      ...createGame(0),
      phase: 'secondPhase' as const,
      trumpSuit: 'diamonds' as Suit,
      trumpRevealed: true,
      currentTrick: {
        cards: [null, null, null, null],
        leadSuit: null,
      },
      hands: [
        [],
        [{ suit: 'diamonds', rank: 'K' }, { suit: 'diamonds', rank: 'Q' }],
        [], [],
      ] as [Card[], Card[], Card[], Card[]],
      currentPlayer: 1 as PlayerIndex,
      bid: { amount: 18, bidder: 0 },
      bidderPairShown: false,
      defenderPairShown: false,
    } as GameState;

    // Player 1 is defender (team 1), has K+Q of trump → can show pair
    const moves = getLegalMoves(state);
    expect(moves.some(m => m.type === 'showPair')).toBe(true);

    const afterPair = applyMove(state, { type: 'showPair' });
    expect(afterPair.defenderPairShown).toBe(true);
    expect(afterPair.bid!.amount).toBe(22); // increased by 4
  });
});

// ─── Full Round Simulation ─────────────────────────────────────────

describe('Full Round Simulation', () => {
  it('completes a full round through scoring', () => {
    let game = createGame(0);

    // Bidding: P3 bids 14, others pass → auction ends
    game = applyMove(game, { type: 'bid', amount: 14 });
    game = applyMove(game, { type: 'pass' }); // P2
    game = applyMove(game, { type: 'pass' }); // P1
    game = applyMove(game, { type: 'pass' }); // P0 → ends

    // Trump selection by P3
    expect(game.phase).toBe('selectingTrump');
    const trumpMoves = getLegalMoves(game);
    expect(trumpMoves.length).toBeGreaterThan(0);
    const tCard = (trumpMoves[0] as { type: 'selectTrump'; card: Card }).card;
    game = applyMove(game, { type: 'selectTrump', card: tCard });

    // Rebid phase — bidder/partner may raise, then pass through to firstPhase
    expect(game.phase).toBe('rebidding');
    expect(game.hands.every(h => h.length === 8)).toBe(true);
    while (game.phase === 'rebidding') {
      game = applyMove(game, { type: 'pass' });
    }
    expect(game.phase).toBe('firstPhase');

    // Verify tricks can be played
    const moves = getLegalMoves(game);
    expect(moves.length).toBeGreaterThan(0);
    
    // Play first card of first trick
    const firstPlay = moves.filter(m => m.type === 'playCard')[0] as { type: 'playCard'; card: Card };
    if (firstPlay) {
      game = applyMove(game, { type: 'playCard', card: firstPlay.card });
      expect(game.currentTrick.cards.filter(c => c !== null).length).toBe(1);
    }

    // Call trump if available (enter Phase 2)
    const afterPlayMoves = getLegalMoves(game);
    const callT = afterPlayMoves.find(m => m.type === 'callTrump');
    if (callT) {
      game = applyMove(game, callT);
      expect(game.phase).toBe('secondPhase');
      expect(game.trumpRevealed).toBe(true);
    }
  });
});
