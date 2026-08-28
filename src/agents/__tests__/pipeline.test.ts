// Agent decision pipeline — JSON extraction and parsing unit tests
import { describe, it, expect } from 'vitest';
import { extractJson, parseDecision } from '../pipeline';
import type { LegalMove, Card } from '../../engine/types';

const bid = (amount: number): LegalMove => ({ type: 'bid', amount });
const biddingMoves: LegalMove[] = [bid(14), bid(15), bid(16), { type: 'pass' }];

// ─── extractJson ──────────────────────────────────────────────────

describe('extractJson', () => {
  it('returns plain JSON unchanged', () => {
    const j = '{"reasoning":"x","action":"bid","bidAmount":14}';
    expect(extractJson(j)).toBe(j);
  });

  it('extracts the final JSON from a gpt-oss thinking-wrapped response', () => {
    const raw =
      '<|channel|>analysis<|message|>think think…<|end|><|start|>assistant<|channel|>final<|message|>' +
      '{"reasoning":"x","action":"bid","bidAmount":14}';
    expect(extractJson(raw)).toBe('{"reasoning":"x","action":"bid","bidAmount":14}');
  });

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"action":"pass"}\n```')).toBe('{"action":"pass"}');
  });

  it('returns an empty-object stub as-is', () => {
    expect(extractJson('{\n\n}')).toBe('{\n\n}');
  });

  it('falls back to the first { … last } span when wrapped in prose', () => {
    expect(extractJson('Here is my answer: {"action":"pass"} thanks.')).toBe('{"action":"pass"}');
  });
});

// ─── parseDecision ────────────────────────────────────────────────

describe('parseDecision', () => {
  it('matches a numeric bid', () => {
    expect(parseDecision({ action: 'bid', bidAmount: 14 }, biddingMoves)).toEqual(bid(14));
  });

  it('coerces a string bidAmount to a number', () => {
    expect(parseDecision({ action: 'bid', bidAmount: '15' }, biddingMoves)).toEqual(bid(15));
  });

  it('is case-insensitive on action', () => {
    expect(parseDecision({ action: 'BID', bidAmount: 14 }, biddingMoves)).toEqual(bid(14));
    expect(parseDecision({ action: 'Pass' }, biddingMoves)).toEqual({ type: 'pass' });
  });

  it('accepts `move` as an alias for action', () => {
    expect(parseDecision({ move: 'pass' }, biddingMoves)).toEqual({ type: 'pass' });
  });

  it('accepts `type` as an alias for action', () => {
    expect(parseDecision({ type: 'bid', bidAmount: 14 }, biddingMoves)).toEqual(bid(14));
  });

  it('returns null for an empty object (the gpt-oss stub)', () => {
    expect(parseDecision({}, biddingMoves)).toBeNull();
  });

  it('returns null for a bid amount with no legal match', () => {
    expect(parseDecision({ action: 'bid', bidAmount: 99 }, biddingMoves)).toBeNull();
  });

  it('matches callTrump / showPair / keepTrump case-insensitively', () => {
    expect(parseDecision({ action: 'callTrump' }, [{ type: 'callTrump' }])).toEqual({ type: 'callTrump' });
    expect(parseDecision({ action: 'CallTrump' }, [{ type: 'callTrump' }])).toEqual({ type: 'callTrump' });
    expect(parseDecision({ action: 'showPair' }, [{ type: 'showPair' }])).toEqual({ type: 'showPair' });
    expect(parseDecision({ action: 'keepTrump' }, [{ type: 'keepTrump' }])).toEqual({ type: 'keepTrump' });
  });

  it('matches a playCard by suit/rank', () => {
    const card: Card = { suit: 'hearts', rank: 'J' };
    const playMoves: LegalMove[] = [{ type: 'playCard', card }];
    expect(parseDecision({ action: 'playCard', cardSuit: 'hearts', cardRank: 'J' }, playMoves))
      .toEqual({ type: 'playCard', card });
  });

  it('returns null when card suit/rank is missing', () => {
    const playMoves: LegalMove[] = [{ type: 'playCard', card: { suit: 'hearts', rank: 'J' } }];
    expect(parseDecision({ action: 'playCard', cardSuit: 'hearts' }, playMoves)).toBeNull();
  });
});
