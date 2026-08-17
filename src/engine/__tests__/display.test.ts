// Thuruppu Table Display — Tests
import { describe, it, expect } from 'vitest';
import { trickToDisplay } from '../../components/trick-display';
import type { Trick } from '../types';

describe('trickToDisplay', () => {
  it('maps a completed trick to the four seat slots', () => {
    const trick: Trick = {
      cards: [
        { card: { suit: 'hearts', rank: 'J' }, player: 0 },
        { card: { suit: 'diamonds', rank: 'A' }, player: 1 },
        { card: { suit: 'clubs', rank: '9' }, player: 2 },
        { card: { suit: 'spades', rank: '10' }, player: 3 },
      ],
      winner: 2,
      points: 7,
      leadSuit: 'hearts',
    };

    const slots = trickToDisplay(trick);

    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ card: { suit: 'hearts', rank: 'J' }, player: 0 });
    expect(slots[1]).toEqual({ card: { suit: 'diamonds', rank: 'A' }, player: 1 });
    expect(slots[2]).toEqual({ card: { suit: 'clubs', rank: '9' }, player: 2 });
    expect(slots[3]).toEqual({ card: { suit: 'spades', rank: '10' }, player: 3 });
  });

  it('places cards in the slot of the player who played them', () => {
    const trick: Trick = {
      cards: [
        { card: { suit: 'spades', rank: '7' }, player: 1 },
        { card: { suit: 'spades', rank: 'K' }, player: 3 },
      ],
      winner: 1,
      points: 0,
      leadSuit: 'spades',
    };

    const slots = trickToDisplay(trick);

    expect(slots[0]).toBeNull();
    expect(slots[1]).toEqual({ card: { suit: 'spades', rank: '7' }, player: 1 });
    expect(slots[2]).toBeNull();
    expect(slots[3]).toEqual({ card: { suit: 'spades', rank: 'K' }, player: 3 });
  });

  it('returns four empty slots for an undefined trick', () => {
    expect(trickToDisplay(undefined)).toEqual([null, null, null, null]);
  });
});
