// Thuruppu Game Engine — Core state machine

import type {
  Card, Suit, Rank, PlayerIndex, TeamIndex,
  TrickCard, Trick, BidRecord, GameState, LegalMove, PlayerViewState,
} from './types';
import {
  createDeck, shuffleDeck, sortHand, getCardPoints, getRankValue,
  getCardsOfSuit, getTeam, getNextPlayer, countPoints, isPointlessHand,
} from './cards';

// ─── Initial State ────────────────────────────────────────────────

export function createGame(dealer: PlayerIndex = 0): GameState {
  const deck = shuffleDeck(createDeck());
  const hands: [Card[], Card[], Card[], Card[]] = [[], [], [], []];

  // Deal first 4 cards counter-clockwise starting to dealer's right
  for (let i = 0; i < 16; i++) {
    hands[(dealer + 3 * (i + 1)) % 4].push(deck[i]);
  }

  return {
    phase: 'bidding',
    hands: hands.map(h => sortHand(h)) as [Card[], Card[], Card[], Card[]],
    currentPlayer: getNextPlayer(dealer), // right of dealer = first bidder
    dealer,
    remainingDeck: deck.slice(16), // 16 undealt cards
    tricks: [],
    currentTrick: { cards: [null, null, null, null], leadSuit: null },
    trumpSuit: null,
    hiddenTrumpCard: null,
    trumpCard: null,
    trumpRevealed: false,
    changingTrump: false,
    preRebidBid: null,
    mustPlayTrump: false,
    bid: null,
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
  };
}

// ─── Copy Helpers ─────────────────────────────────────────────────

function cloneHands(hands: GameState['hands']): GameState['hands'] {
  return hands.map(h => [...h]) as GameState['hands'];
}

function cloneTricks(tricks: Trick[]): Trick[] {
  return tricks.map(t => ({
    cards: [...t.cards],
    winner: t.winner,
    points: t.points,
  }));
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    hands: cloneHands(state.hands),
    remainingDeck: [...state.remainingDeck],
    tricks: cloneTricks(state.tricks),
    currentTrick: {
      cards: [...state.currentTrick.cards],
      leadSuit: state.currentTrick.leadSuit,
    },
    bidHistory: [...state.bidHistory],
    scores: { ...state.scores },
    roundResult: state.roundResult ? { ...state.roundResult } : null,
  };
}

// ─── Trick Winner ──────────────────────────────────────────────────

export function getTrickWinner(
  cards: TrickCard[],
  leadSuit: Suit,
  trumpSuit: Suit | null,
  trumpRevealed: boolean,
): PlayerIndex {
  if (cards.length === 0) throw new Error('No cards in trick');

  let winner = cards[0];
  let winnerIsTrump = trumpRevealed && trumpSuit !== null && winner.card.suit === trumpSuit;
  let winnerIsLead = winner.card.suit === leadSuit;

  for (let i = 1; i < cards.length; i++) {
    const current = cards[i];
    const currIsTrump = trumpRevealed && trumpSuit !== null && current.card.suit === trumpSuit;

    if (currIsTrump && !winnerIsTrump) {
      // Current is trump, winner is not → current wins
      winner = current;
      winnerIsTrump = true;
      winnerIsLead = current.card.suit === leadSuit;
    } else if (currIsTrump && winnerIsTrump) {
      // Both trump → higher rank wins
      if (getRankValue(current.card.rank) > getRankValue(winner.card.rank)) {
        winner = current;
      }
    } else if (!currIsTrump && !winnerIsTrump) {
      // Neither is trump
      const currIsLead = current.card.suit === leadSuit;
      if (currIsLead && !winnerIsLead) {
        // Current follows lead, winner is off-suit → current wins
        winner = current;
        winnerIsLead = true;
      } else if (currIsLead && winnerIsLead) {
        // Both follow lead → higher rank wins
        if (getRankValue(current.card.rank) > getRankValue(winner.card.rank)) {
          winner = current;
        }
      }
      // else: current off-suit, winner follows lead → keep winner
    }
  }

  return winner.player;
}

// ─── Legal Moves ───────────────────────────────────────────────────

export function getLegalMoves(state: GameState): LegalMove[] {
  switch (state.phase) {
    case 'bidding': return getBiddingMoves(state);
    case 'selectingTrump': return getSelectingTrumpMoves(state);
    case 'rebidding': return getRebiddingMoves(state);
    case 'firstPhase': return getFirstPhaseMoves(state);
    case 'secondPhase': return getSecondPhaseMoves(state);
    case 'dealing': return [];
    case 'scoring': return [{ type: 'nextRound' }];
    case 'finished': return [];
  }
}

function getRebiddingMoves(state: GameState): LegalMove[] {
  // After the 8-card deal, bidder or partner may raise to at least 24.
  // Only the current rebid player may act; others see no moves.
  const player = state.currentPlayer;
  if (!state.rebidPlayers.includes(player)) {
    return [];
  }

  const moves: LegalMove[] = [];
  const currentBid = state.bid?.amount ?? 0;
  const minBid = Math.max(23, currentBid + 1);

  for (let amount = minBid; amount <= 28; amount++) {
    moves.push({ type: 'bid', amount });
  }

  // Can pass (decline to rebid)
  moves.push({ type: 'pass' });

  return moves;
}

function getBiddingMoves(state: GameState): LegalMove[] {
  const moves: LegalMove[] = [];
  const currentMin = state.bid ? state.bid.amount + 1 : 14;

  for (let amount = currentMin; amount <= 28; amount++) {
    moves.push({ type: 'bid', amount });
  }

  const isFirstBidder = state.bidHistory.length === 0;
  if (!isFirstBidder) {
    moves.push({ type: 'pass' });
  }

  // Redeal available if all 4 have passed (edge case for manual state)
  if (state.bid === null && state.bidHistory.length >= 4) {
    moves.push({ type: 'redeal' });
  }

  return moves;
}

function getSelectingTrumpMoves(state: GameState): LegalMove[] {
  const hand = state.hands[state.currentPlayer];
  const moves: LegalMove[] = hand.map(card => ({ type: 'selectTrump' as const, card }));
  // When changing trump after a rebid raise, the bidder may also keep the current trump.
  if (state.changingTrump) {
    moves.push({ type: 'keepTrump' as const });
  }
  return moves;
}

function getFirstPhaseMoves(state: GameState): LegalMove[] {
  const hand = state.hands[state.currentPlayer];
  const leadSuit = state.currentTrick.leadSuit;
  const moves: LegalMove[] = [];
  const isBidder = state.currentPlayer === state.bid?.bidder;

  if (leadSuit === null) {
    // Leading a trick — the bidder cannot lead trump until it is declared.
    // If that restriction would leave the bidder with no legal card at all
    // (a hand of only trump + the hidden card), fall back to any playable card
    // so the game can never deadlock.
    const leadable = hand.filter(card =>
      !(isBidder && state.trumpSuit && card.suit === state.trumpSuit && !state.trumpLedThisTrick) &&
      !cardEquals(card, state.hiddenTrumpCard),
    );
    // If the restriction would leave the bidder with no legal card at all,
    // fall back to any playable card — including the hidden trump if it is the
    // only card left — so the game can never deadlock.
    const source = leadable.length > 0 ? leadable : hand;
    for (const card of source) {
      moves.push({ type: 'playCard', card });
    }
  } else {
    // Following
    const followingCards = getCardsOfSuit(hand, leadSuit);
    if (followingCards.length > 0) {
      const followable = followingCards.filter(card => !cardEquals(card, state.hiddenTrumpCard));
      // If the only card that can follow is the hidden trump card, allow it
      // rather than leave the player with no legal move.
      const source = followable.length > 0 ? followable : followingCards;
      for (const card of source) {
        moves.push({ type: 'playCard', card });
      }
    } else {
      // Cannot follow suit — can discard or call trump.
      // The bidder's "locked trump" rule: in Phase 1, when void in a NON-trump
      // led suit, the bidder may NOT play trump cards from hand. They may only
      // discard a non-trump card or reveal the trump card (callTrump).
      const bidderLockedTrump =
        isBidder && !state.trumpRevealed && state.trumpSuit !== null && leadSuit !== state.trumpSuit;

      for (const card of hand) {
        if (cardEquals(card, state.hiddenTrumpCard)) continue;
        if (bidderLockedTrump && card.suit === state.trumpSuit) continue;
        moves.push({ type: 'playCard', card });
      }
      if (!state.trumpRevealed) {
        moves.push({ type: 'callTrump' });
      }
    }
  }

  return moves;
}

function getSecondPhaseMoves(state: GameState): LegalMove[] {
  const hand = state.hands[state.currentPlayer];
  const leadSuit = state.currentTrick.leadSuit;
  const moves: LegalMove[] = [];
  const trumpSuit = state.trumpSuit;

  // The trump caller must play a trump card if they hold one.
  if (state.mustPlayTrump && trumpSuit) {
    const myTrumps = getCardsOfSuit(hand, trumpSuit);
    if (myTrumps.length > 0) {
      for (const card of myTrumps) {
        moves.push({ type: 'playCard', card });
      }
      return moves;
    }
    // No trump held — may play any card.
    for (const card of hand) {
      moves.push({ type: 'playCard', card });
    }
    return moves;
  }

  if (leadSuit === null) {
    for (const card of hand) {
      // Hidden trump card is now playable in Phase 2
      moves.push({ type: 'playCard', card });
    }
  } else {
    const followingCards = getCardsOfSuit(hand, leadSuit);
    if (followingCards.length > 0) {
      for (const card of followingCards) {
        moves.push({ type: 'playCard', card });
      }
    } else {
      // Cannot follow suit
      const trickHasTrump = state.currentTrick.cards.some(
        c => c !== null && trumpSuit !== null && c.card.suit === trumpSuit,
      );

      if (trickHasTrump && trumpSuit) {
        // Must over-trump if possible
        const myTrumps = getCardsOfSuit(hand, trumpSuit);
        if (myTrumps.length > 0) {
          const trumpInTrick = state.currentTrick.cards.filter(
            c => c !== null && c.card.suit === trumpSuit,
          ) as TrickCard[];
          const highestTrumpInTrick = trumpInTrick.reduce<TrickCard>((best, c) =>
            getRankValue(c.card.rank) > getRankValue(best.card.rank) ? c : best,
          trumpInTrick[0]);

          const overTrumps = myTrumps.filter(
            c => getRankValue(c.rank) > getRankValue(highestTrumpInTrick!.card.rank),
          );

          if (overTrumps.length > 0) {
            for (const card of overTrumps) {
              moves.push({ type: 'playCard', card });
            }
          } else {
            for (const card of hand) {
              moves.push({ type: 'playCard', card });
            }
          }
        } else {
          for (const card of hand) {
            moves.push({ type: 'playCard', card });
          }
        }
      } else {
        for (const card of hand) {
          moves.push({ type: 'playCard', card });
        }
      }
    }
  }

  // Pair rule
  if (trumpSuit && state.trumpRevealed) {
    const playerHand = state.hands[state.currentPlayer];
    const hasK = playerHand.some(c => c.suit === trumpSuit && c.rank === 'K');
    const hasQ = playerHand.some(c => c.suit === trumpSuit && c.rank === 'Q');
    const playerTeam = getTeam(state.currentPlayer);
    const bidderTeam = state.bid ? getTeam(state.bid.bidder) : null;

    if (hasK && hasQ) {
      if (playerTeam === bidderTeam && !state.bidderPairShown) {
        moves.push({ type: 'showPair' });
      } else if (playerTeam !== bidderTeam && !state.defenderPairShown) {
        moves.push({ type: 'showPair' });
      }
    }
  }

  return moves;
}

// ─── Card Equality Helper ─────────────────────────────────────────

function cardEquals(a: Card | null, b: Card | null): boolean {
  if (a === null || b === null) return false;
  return a.suit === b.suit && a.rank === b.rank;
}

// ─── Move Equality for Validation ─────────────────────────────────

function moveEquals(legal: LegalMove, move: LegalMove): boolean {
  if (legal.type !== move.type) return false;
  switch (move.type) {
    case 'bid': return legal.type === 'bid' && legal.amount === move.amount;
    case 'playCard': return legal.type === 'playCard' && cardEquals(legal.card, move.card);
    case 'selectTrump': return legal.type === 'selectTrump' && cardEquals(legal.card, move.card);
    default: return true; // pass, callTrump, showPair, nextRound, redeal
  }
}

// ─── Apply Move ────────────────────────────────────────────────────

export function applyMove(state: GameState, move: LegalMove): GameState {
  const legal = getLegalMoves(state);
  const isLegal = legal.some(m => moveEquals(m, move));
  if (!isLegal) {
    throw new Error(`Illegal move: ${JSON.stringify(move)}`);
  }

  switch (move.type) {
    case 'bid': return handleBid(state, move.amount);
    case 'pass': return handlePass(state);
    case 'selectTrump': return handleSelectTrump(state, move.card);
    case 'keepTrump': return handleKeepTrump(state);
    case 'playCard': return handlePlayCard(state, move.card);
    case 'callTrump': return handleCallTrump(state);
    case 'showPair': return handleShowPair(state);
    case 'nextRound': return handleNextRound(state);
    case 'redeal': return handleRedeal(state);
  }
}

// ─── Move Handlers ─────────────────────────────────────────────────

function handleBid(state: GameState, amount: number): GameState {
  const s = cloneState(state);

  // Rebid phase: bidder/partner raising to 24+ after 8-card deal
  if (s.phase === 'rebidding') {
    s.bid = { amount, bidder: s.currentPlayer };
    s.bidHistory = [...s.bidHistory, { player: s.currentPlayer, amount, pass: false }];
    // After any rebid, the other rebid player may still respond
    s.rebidPlayers = s.rebidPlayers.filter(p => p !== s.currentPlayer);
    return advanceRebid(s);
  }

  s.bid = { amount, bidder: s.currentPlayer };
  s.bidHistory = [...s.bidHistory, { player: s.currentPlayer, amount, pass: false }];
  s.passesSinceLastBid = 0;
  s.currentPlayer = getNextPlayer(s.currentPlayer);
  return s;
}

function advanceRebid(state: GameState): GameState {
  const s = cloneState(state);
  // If no more rebid players, move to firstPhase
  if (s.rebidPlayers.length === 0) {
    return finishRebid(s);
  }
  s.currentPlayer = s.rebidPlayers[0];
  return s;
}

function handlePass(state: GameState): GameState {
  const s = cloneState(state);

  // Rebid phase pass: this rebid player declines
  if (s.phase === 'rebidding') {
    s.bidHistory = [...s.bidHistory, { player: s.currentPlayer, pass: true }];
    s.rebidPlayers = s.rebidPlayers.filter(p => p !== s.currentPlayer);
    return advanceRebid(s);
  }

  s.bidHistory = [...s.bidHistory, { player: s.currentPlayer, pass: true }];
  s.passesSinceLastBid++;

  // 3 consecutive passes → auction ends
  if (s.passesSinceLastBid >= 3) {
    if (s.bid === null) {
      return handleRedeal(s); // no one bid → redeal
    }
    return startTrumpSelection(s);
  }

  // All 4 passed after a bid
  if (s.bidHistory.length >= 4 &&
      s.bidHistory.slice(-4).every(r => r.pass) &&
      s.bid !== null) {
    return startTrumpSelection(s);
  }

  s.currentPlayer = getNextPlayer(s.currentPlayer);
  return s;
}

function startTrumpSelection(state: GameState): GameState {
  const s = cloneState(state);
  s.phase = 'selectingTrump';
  s.currentPlayer = s.bid!.bidder; // bidder must choose trump
  return s;
}

function handleSelectTrump(state: GameState, card: Card): GameState {
  const s = cloneState(state);
  const bidder = s.bid!.bidder;

  // Verify card is in bidder's hand
  const cardIdx = s.hands[bidder].findIndex(c => cardEquals(c, card));
  if (cardIdx === -1) throw new Error('Trump card not in hand');

  s.trumpSuit = card.suit;
  s.hiddenTrumpCard = card; // Mark as hidden — stays in hand
  s.trumpCard = card;       // Persistent — the trump card itself, never cleared

  // If changing trump after a rebid raise, go straight to first phase.
  if (s.changingTrump) {
    s.changingTrump = false;
    s.phase = 'firstPhase';
    s.currentPlayer = getNextPlayer(s.dealer);
    s.trickNumber = 1;
    return s;
  }

  return completeDealAndStartPlay(s);
}

function handleKeepTrump(state: GameState): GameState {
  const s = cloneState(state);
  s.changingTrump = false;
  s.phase = 'firstPhase';
  s.currentPlayer = getNextPlayer(s.dealer);
  s.trickNumber = 1;
  return s;
}

function completeDealAndStartPlay(state: GameState): GameState {
  const s = cloneState(state);
  s.phase = 'rebidding';

  // Deal remaining 4 cards to each player from the saved remainingDeck
  const deck = [...s.remainingDeck]; // Use the original undealt cards
  let cardIndex = 0;
  for (let p = 0; p < 4; p++) {
    const existingCount = s.hands[p].length;
    for (let i = existingCount; i < 8; i++) {
      if (cardIndex >= deck.length) break; // Should not happen
      s.hands[p].push(deck[cardIndex++]);
    }
    s.hands[p] = sortHand(s.hands[p]);
  }
  s.remainingDeck = []; // Consumed

  // Check for pointless hands — if any player has 8 worthless cards, game cancelled
  for (let p = 0; p < 4; p++) {
    if (isPointlessHand(s.hands[p])) {
      return handleRedeal(s);
    }
  }

  // Rebid phase: bidder and partner may raise to 24+
  const bidder = s.bid!.bidder;
  const partner = (bidder + 2) % 4 as PlayerIndex;
  s.preRebidBid = s.bid!.amount;
  s.rebidPlayers = [bidder, partner];
  s.currentPlayer = bidder;

  return s;
}

function finishRebid(state: GameState): GameState {
  const s = cloneState(state);
  s.rebidPlayers = [];

  // If the bid was raised during rebid, the bidder may change the trump card.
  if (s.preRebidBid !== null && s.bid!.amount > s.preRebidBid) {
    s.changingTrump = true;
    s.phase = 'selectingTrump';
    s.currentPlayer = s.bid!.bidder;
    return s;
  }

  s.changingTrump = false;
  s.phase = 'firstPhase';
  // Player to dealer's right leads the first trick
  s.currentPlayer = getNextPlayer(s.dealer);
  s.trickNumber = 1;
  return s;
}

function handleCallTrump(state: GameState): GameState {
  const s = cloneState(state);
  s.trumpRevealed = true;
  s.phase = 'secondPhase';
  // Keep hiddenTrumpCard — it's now visible to all as the revealed trump card
  // (it's still in the bidder's hand and playable)
  // The caller must now play a trump card if they hold one.
  s.mustPlayTrump = true;
  return s;
}

function handleShowPair(state: GameState): GameState {
  const s = cloneState(state);
  const player = s.currentPlayer;
  const playerTeam = getTeam(player);
  const bidderTeam = getTeam(s.bid!.bidder);

  if (playerTeam === bidderTeam) {
    s.bidderPairShown = true;
    s.bid = { ...s.bid!, amount: s.bid!.amount - 4 };
  } else {
    s.defenderPairShown = true;
    s.bid = { ...s.bid!, amount: s.bid!.amount + 4 };
  }

  return s;
}

function handleNextRound(state: GameState): GameState {
  // Rotate dealer counter-clockwise
  const newDealer = getNextPlayer(state.dealer);
  const newGame = createGame(newDealer);

  // Preserve scores and winner
  return {
    ...newGame,
    scores: { ...state.scores },
    winner: state.winner,
  };
}

function handleRedeal(state: GameState): GameState {
  const newGame = createGame(state.dealer);
  return {
    ...newGame,
    scores: { ...state.scores },
    winner: state.winner,
  };
}

/** Concede the match — conceding team loses, game ends immediately. */
export function concedeGame(state: GameState, concedingPlayer: PlayerIndex): GameState {
  const s = cloneState(state);
  const concedingTeam = getTeam(concedingPlayer);
  s.winner = (concedingTeam === 0 ? 1 : 0) as TeamIndex;
  s.phase = 'finished';
  s.roundComplete = true;
  return s;
}

function handlePlayCard(state: GameState, card: Card): GameState {
  const s = cloneState(state);
  const player = s.currentPlayer;
  const hand = s.hands[player];
  const cardIndex = hand.findIndex(c => cardEquals(c, card));

  if (cardIndex === -1) {
    throw new Error('Card not in hand');
  }

  // Remove from hand
  s.hands[player] = [...hand.slice(0, cardIndex), ...hand.slice(cardIndex + 1)];

  // Clear the "must play trump" obligation once the caller plays
  s.mustPlayTrump = false;

  // Clear hidden trump reference if it was played
  if (cardEquals(card, s.hiddenTrumpCard)) {
    s.hiddenTrumpCard = null;
  }

  // Set lead suit if first card
  if (s.currentTrick.leadSuit === null) {
    s.currentTrick.leadSuit = card.suit;
  }

  // Track if trump was played this trick
  if (s.trumpSuit && card.suit === s.trumpSuit) {
    s.trumpLedThisTrick = true;
  }

  // Place card
  const newTrickCards = [...s.currentTrick.cards];
  newTrickCards[player] = { card, player };
  s.currentTrick = { ...s.currentTrick, cards: newTrickCards };

  // Check if trick is complete (4 cards)
  const placedCount = newTrickCards.filter(c => c !== null).length;
  if (placedCount === 4) {
    return finishTrick(s);
  }

  // Advance to next player
  s.currentPlayer = getNextPlayer(player);
  return s;
}

function finishTrick(state: GameState): GameState {
  const s = cloneState(state);
  const cards = s.currentTrick.cards.filter(c => c !== null) as TrickCard[];
  const leadSuit = s.currentTrick.leadSuit!;

  const winner = getTrickWinner(cards, leadSuit, s.trumpSuit, s.trumpRevealed);
  const points = cards.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);

  console.log(
    `[thuruppu-trick] trick #${s.trickNumber} winner=P${winner} leadSuit=${leadSuit} ` +
    `trump=${s.trumpSuit ?? 'none'} revealed=${s.trumpRevealed} points=${points} ` +
    `cards=[${cards.map(c => `P${c.player}:${c.card.rank}${c.card.suit}`).join(', ')}]`
  );

  const trick: Trick = { cards, winner, points };
  s.tricks = [...s.tricks, trick];
  s.currentTrick = { cards: [null, null, null, null], leadSuit: null };
  s.currentPlayer = winner;
  s.trickNumber++;
  s.trumpLedThisTrick = false;

  // Check if round is complete (8 tricks)
  if (s.tricks.length === 8) {
    return computeRoundResult(s);
  }

  return s;
}

export function computeRoundResult(state: GameState): GameState {
  const s = cloneState(state);
  s.phase = 'scoring';
  s.roundComplete = true;

  const bid = s.bid!;
  const bidderTeam = getTeam(bid.bidder);

  // Count points per team
  let team0Points = 0;
  let team1Points = 0;
  for (const trick of s.tricks) {
    const winnerTeam = getTeam(trick.winner);
    if (winnerTeam === 0) team0Points += trick.points;
    else team1Points += trick.points;
  }

  const biddingTeamPoints = bidderTeam === 0 ? team0Points : team1Points;
  const defendingTeamPoints = bidderTeam === 0 ? team1Points : team0Points;
  const biddingTeamWon = biddingTeamPoints >= bid.amount;

  // Tiered scoring by bid bracket (Kerala / Feathersoft rules)
  let pointsChange: number;
  if (bid.amount <= 19)      pointsChange = biddingTeamWon ? 1 : -2;
  else if (bid.amount <= 23) pointsChange = biddingTeamWon ? 2 : -3;
  else if (bid.amount <= 27) pointsChange = biddingTeamWon ? 3 : -4;
  else                       pointsChange = biddingTeamWon ? 4 : -5;

  s.roundResult = {
    biddingTeamWon,
    bidAmount: bid.amount,
    biddingTeamPoints,
    defendingTeamPoints,
    pointsChange,
  };

  // Update scores — bidding team gains/loses the bracket value
  if (bidderTeam === 0) {
    s.scores = { ...s.scores, team0: s.scores.team0 + pointsChange };
  } else {
    s.scores = { ...s.scores, team1: s.scores.team1 + pointsChange };
  }

  // Check match end
  if (s.scores.team0 >= 6) {
    s.winner = 0;
    s.phase = 'finished';
  } else if (s.scores.team1 >= 6) {
    s.winner = 1;
    s.phase = 'finished';
  } else if (s.scores.team0 <= -6) {
    s.winner = 1;
    s.phase = 'finished';
  } else if (s.scores.team1 <= -6) {
    s.winner = 0;
    s.phase = 'finished';
  }

  return s;
}

// ─── Early Resolution ──────────────────────────────────────────────

export interface RoundDecidedInfo {
  decided: boolean;
  winner: TeamIndex | null;   // team that is guaranteed to win the round
  reason: string;
}

/**
 * Determine whether the current round is already mathematically decided.
 * The bidding team needs at least `bid.amount` card points. Once the
 * defending team has captured enough points that the bidding team can no
 * longer reach their bid — or the bidding team has already met it — the
 * remaining tricks cannot change the outcome.
 */
export function getRoundDecided(state: GameState): RoundDecidedInfo {
  const bid = state.bid;
  if (!bid) return { decided: false, winner: null, reason: '' };
  if (state.phase !== 'firstPhase' && state.phase !== 'secondPhase') {
    return { decided: false, winner: null, reason: '' };
  }

  const bidderTeam = getTeam(bid.bidder);

  // Points won per team from completed tricks
  let team0Points = 0;
  let team1Points = 0;
  for (const trick of state.tricks) {
    const winnerTeam = getTeam(trick.winner);
    if (winnerTeam === 0) team0Points += trick.points;
    else team1Points += trick.points;
  }

  const biddingTeamPoints = bidderTeam === 0 ? team0Points : team1Points;
  const defendingTeamPoints = bidderTeam === 0 ? team1Points : team0Points;

  // Bidding team already met their bid → they win, decided.
  if (biddingTeamPoints >= bid.amount) {
    return {
      decided: true,
      winner: bidderTeam,
      reason: `Bidding team already has ${biddingTeamPoints} pts (bid ${bid.amount}) — they cannot lose.`,
    };
  }

  // Remaining points in play = 28 - (already won). Bidding team's max
  // achievable = biddingTeamPoints + remaining = 28 - defendingTeamPoints.
  const maxBiddingTeamCanReach = 28 - defendingTeamPoints;
  if (maxBiddingTeamCanReach < bid.amount) {
    return {
      decided: true,
      winner: bidderTeam === 0 ? 1 : 0,
      reason: `Bidding team can reach at most ${maxBiddingTeamCanReach} pts, but needs ${bid.amount} — they cannot win.`,
    };
  }

  return { decided: false, winner: null, reason: '' };
}

/** Resolve the round immediately — the remaining tricks are moot. */
export function resolveRoundEarly(state: GameState): GameState {
  return computeRoundResult(state);
}

// ─── Player View ───────────────────────────────────────────────────

export function getPlayerView(state: GameState, playerIndex: PlayerIndex): PlayerViewState {
  const teamIdx = getTeam(playerIndex);
  const legalMoves = state.currentPlayer === playerIndex ? getLegalMoves(state) : [];

  // Partner: (0↔2) or (1↔3)
  const partner = playerIndex === 0 ? 2 : playerIndex === 2 ? 0 :
                  playerIndex === 1 ? 3 : 1;
  const opponents: PlayerIndex[] = playerIndex === 0 ? [1, 3] :
                                    playerIndex === 1 ? [0, 2] :
                                    playerIndex === 2 ? [1, 3] : [0, 2];

  const visibleTrumpSuit = state.trumpRevealed ? state.trumpSuit : null;

  return {
    phase: state.phase,
    playerIndex,
    teamIndex: teamIdx,
    hand: [...state.hands[playerIndex]],
    partnerHandCount: state.hands[partner].length,
    opponentHandCounts: [state.hands[opponents[0]].length, state.hands[opponents[1]].length],
    currentPlayer: state.currentPlayer,
    dealer: state.dealer,
    tricks: state.tricks,
    currentTrick: {
      cards: [...state.currentTrick.cards],
      leadSuit: state.currentTrick.leadSuit,
    },
    trumpSuit: visibleTrumpSuit,
    trumpRevealed: state.trumpRevealed,
    bid: state.bid,
    bidHistory: state.bidHistory,
    rebidPlayers: [...state.rebidPlayers],
    bidderPairShown: state.bidderPairShown,
    defenderPairShown: state.defenderPairShown,
    scores: state.scores,
    trickNumber: state.trickNumber,
    // Show hidden trump card to everyone after it's revealed
    hiddenTrumpCard: (state.trumpRevealed || state.currentPlayer === playerIndex || state.bid?.bidder === playerIndex)
      ? state.hiddenTrumpCard
      : null,
    // Trump card itself — visible to everyone after reveal, persists after played
    trumpCard: state.trumpRevealed ? state.trumpCard : null,
    changingTrump: state.changingTrump,
    allowConcede: false, // overridden by the store based on env config
    roundDecided: getRoundDecided(state),
    roundComplete: state.roundComplete,
    roundResult: state.roundResult,
    winner: state.winner,
    legalMoves,
  };
}

// ─── Re-export cards utilities ─────────────────────────────────────

export {
  createDeck, shuffleDeck, sortHand, getCardPoints, getRankValue,
  getCardsOfSuit, isPointlessHand, countPoints, getTeam, getNextPlayer,
} from './cards';
