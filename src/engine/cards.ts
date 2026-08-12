// Thuruppu Game Engine — Card utilities

import type { Card, Suit, Rank, TeamIndex, PlayerIndex } from './types';

export const ALL_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

// Ranks in ascending order: 7 is lowest, J is highest
export const ALL_RANKS: Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

export const RANK_ORDER: Record<Rank, number> = {
  '7': 0, '8': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5, '9': 6, 'J': 7,
};

export const CARD_POINTS: Partial<Record<Rank, number>> = {
  J: 3, '9': 2, A: 1, '10': 1,
};

/** Create a fresh 32-card deck (J,9,A,10,K,Q,8,7 × 4 suits) */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Sort hand: by suit, then by rank (J highest, 7 lowest) */
export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return RANK_ORDER[b.rank] - RANK_ORDER[a.rank]; // descending rank
  });
}

/** Return the point value of a card */
export function getCardPoints(card: Card): number {
  return CARD_POINTS[card.rank] ?? 0;
}

/** Return numeric rank value for comparison (0-7) */
export function getRankValue(rank: Rank): number {
  return RANK_ORDER[rank];
}

/** Human-readable card string, e.g. "J♥" */
export function formatCard(card: Card): string {
  const suitSymbol: Record<Suit, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
  };
  return `${card.rank}${suitSymbol[card.suit]}`;
}

/** Get team index for a player (0,2)→0, (1,3)→1 */
export function getTeam(playerIndex: PlayerIndex): TeamIndex {
  return (playerIndex % 2) as TeamIndex;
}

/** Get next player counter-clockwise (0→3→2→1→0) */
export function getNextPlayer(current: PlayerIndex): PlayerIndex {
  return ((current + 3) % 4) as PlayerIndex;
}

/** Get cards of a specific suit from a hand */
export function getCardsOfSuit(hand: Card[], suit: Suit): Card[] {
  return hand.filter(c => c.suit === suit);
}

/** Check if all cards in hand are worthless (0 points) */
export function isPointlessHand(hand: Card[]): boolean {
  return hand.every(c => getCardPoints(c) === 0);
}

/** Calculate total points in a set of cards */
export function countPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + getCardPoints(c), 0);
}
