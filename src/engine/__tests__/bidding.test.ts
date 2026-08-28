// Thuruppu Game Engine — Deterministic Opening-Bid Evaluation Tests
import { describe, it, expect } from 'vitest';
import { evaluateOpeningHand, evaluateRebidHand, chooseMaxLegalBid } from '../bidding';
import type { Card, LegalMove } from '../types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

// ─── evaluateOpeningHand ───────────────────────────────────────────

describe('evaluateOpeningHand', () => {
  it('weak zero-point hand caps at the minimum bid of 14', () => {
    const hand = [c('hearts', 'K'), c('spades', 'Q'), c('diamonds', '8'), c('clubs', '7')];
    expect(evaluateOpeningHand(hand).maxBid).toBe(14);
  });

  it('single ace/tens hand stays at 14', () => {
    const hand = [c('hearts', 'A'), c('spades', 'Q'), c('diamonds', '8'), c('clubs', '7')];
    expect(evaluateOpeningHand(hand).maxBid).toBe(14);
  });

  it('manual example (J♥ 9♥ A♠ 7♣) supports a 15-16 bid', () => {
    const hand = [c('hearts', 'J'), c('hearts', '9'), c('spades', 'A'), c('clubs', '7')];
    const e = evaluateOpeningHand(hand);
    expect(e.maxBid).toBeGreaterThanOrEqual(15);
    expect(e.maxBid).toBeLessThanOrEqual(16);
  });

  it('two Jacks (J♥ J♦ A♠ 7♣) supports 16+', () => {
    const hand = [c('hearts', 'J'), c('diamonds', 'J'), c('spades', 'A'), c('clubs', '7')];
    expect(evaluateOpeningHand(hand).maxBid).toBeGreaterThanOrEqual(16);
  });

  it('J+9+A of one suit supports 16+', () => {
    const hand = [c('hearts', 'J'), c('hearts', '9'), c('hearts', 'A'), c('clubs', '7')];
    expect(evaluateOpeningHand(hand).maxBid).toBeGreaterThanOrEqual(16);
  });

  it('four honours of one suit supports 17', () => {
    const hand = [c('hearts', 'J'), c('hearts', '9'), c('hearts', 'A'), c('hearts', '10')];
    expect(evaluateOpeningHand(hand).maxBid).toBe(17);
  });

  it('exceptional hand supports the moderate cap of 18', () => {
    const hand = [c('hearts', 'J'), c('hearts', '9'), c('diamonds', 'J'), c('spades', 'A')];
    expect(evaluateOpeningHand(hand).maxBid).toBe(18);
  });

  it('never exceeds the cap of 18', () => {
    const hand = [c('hearts', 'J'), c('spades', 'J'), c('diamonds', 'J'), c('clubs', '9')];
    expect(evaluateOpeningHand(hand).maxBid).toBeLessThanOrEqual(18);
  });

  it('reports the raw point total', () => {
    const hand = [c('hearts', 'J'), c('hearts', '9'), c('spades', 'A'), c('clubs', '7')];
    expect(evaluateOpeningHand(hand).points).toBe(6);
  });
});

// ─── evaluateRebidHand ─────────────────────────────────────────────

describe('evaluateRebidHand', () => {
  it('balanced weak hand cannot rebid (caps below 24 → pass)', () => {
    const hand = [
      c('hearts', 'A'), c('hearts', '10'), c('diamonds', 'K'), c('diamonds', 'Q'),
      c('clubs', '8'), c('clubs', '7'), c('spades', 'K'), c('spades', 'Q'),
    ];
    expect(evaluateRebidHand(hand).maxRebid).toBe(22);
  });

  it('points scattered across all four suits cannot rebid to 24', () => {
    const hand = [
      c('hearts', 'J'), c('hearts', 'A'), c('diamonds', '9'), c('diamonds', 'A'),
      c('clubs', '10'), c('clubs', 'K'), c('spades', '9'), c('spades', 'Q'),
    ];
    expect(evaluateRebidHand(hand).maxRebid).toBe(22);
  });

  it('strong concentrated trump hand supports a 24 rebid', () => {
    const hand = [
      c('hearts', 'J'), c('hearts', '9'), c('hearts', 'A'), c('hearts', '10'), c('hearts', 'K'),
      c('diamonds', 'J'), c('spades', 'A'), c('spades', '10'),
    ];
    expect(evaluateRebidHand(hand).maxRebid).toBeGreaterThanOrEqual(24);
  });

  it('marginal hand — deep trump but few points — passes (caps below 24)', () => {
    const hand = [
      c('hearts', 'J'), c('hearts', '9'), c('hearts', 'A'), c('hearts', '10'), c('hearts', 'K'),
      c('spades', 'A'), c('spades', '10'), c('clubs', '8'),
    ];
    expect(evaluateRebidHand(hand).maxRebid).toBe(22);
  });

  it('two strong suits with high cards supports 26+', () => {
    const hand = [
      c('hearts', 'J'), c('hearts', '9'), c('hearts', 'A'), c('hearts', '10'),
      c('spades', 'J'), c('spades', '9'), c('spades', 'A'), c('spades', '10'),
    ];
    expect(evaluateRebidHand(hand).maxRebid).toBeGreaterThanOrEqual(26);
  });

  it('reports the raw point total', () => {
    const hand = [
      c('hearts', 'J'), c('hearts', '9'), c('spades', 'A'), c('clubs', '7'),
      c('diamonds', '10'), c('diamonds', 'K'), c('clubs', '8'), c('spades', 'Q'),
    ];
    expect(evaluateRebidHand(hand).points).toBe(7);
  });
});

// ─── chooseMaxLegalBid ─────────────────────────────────────────────

describe('chooseMaxLegalBid', () => {
  const bid = (amount: number): LegalMove => ({ type: 'bid', amount });

  it('returns the highest legal bid at or below the cap', () => {
    const moves = [bid(14), bid(15), bid(16), bid(17), bid(18), bid(19)];
    expect(chooseMaxLegalBid(moves, 16)).toBe(16);
  });

  it('returns null when every legal bid exceeds the cap', () => {
    const moves = [bid(17), bid(18), bid(19), bid(20)];
    expect(chooseMaxLegalBid(moves, 16)).toBeNull();
  });

  it('returns null when there are no bid moves', () => {
    expect(chooseMaxLegalBid([], 18)).toBeNull();
    expect(chooseMaxLegalBid([{ type: 'pass' }], 18)).toBeNull();
  });
});
