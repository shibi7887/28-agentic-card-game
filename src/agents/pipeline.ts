// Agent decision pipeline — full flow from state to validated move

import type { PlayerViewState, Card, LegalMove, Suit, Rank } from '@/engine/types';
import type { AgentProfile } from './profiles';
import { callLLM } from './providers';
import { buildBiddingPrompt, buildPlayPrompt, buildTrumpSelectionPrompt, buildRebiddingPrompt } from './prompts';
import { evaluateOpeningHand, chooseMaxLegalBid } from '@/engine/bidding';

interface AgentDecision {
  action: string;
  bidAmount?: number;
  cardSuit?: string;
  cardRank?: string;
  reasoning?: string;
}

/**
 * Enforce the conservative opening-bid cap: with only 4 cards, no agent may
 * bid above the deterministic max for its hand. If the legal minimum already
 * exceeds the cap, the agent must pass.
 */
function clampOpeningBid(
  name: string,
  state: PlayerViewState,
  proposed: { type: 'bid'; amount: number },
): { move: LegalMove; reasoning: string } {
  const { maxBid } = evaluateOpeningHand(state.hand);
  if (proposed.amount <= maxBid) {
    return { move: proposed, reasoning: '' };
  }

  const capped = chooseMaxLegalBid(state.legalMoves, maxBid);
  if (capped !== null) {
    console.warn(`Agent ${name} opening bid ${proposed.amount} clamped to ${capped} (max ${maxBid}).`);
    return {
      move: { type: 'bid', amount: capped },
      reasoning: `Opening bid capped at ${maxBid} with only 4 cards; bidding ${capped}.`,
    };
  }

  const pass = state.legalMoves.find((m) => m.type === 'pass');
  if (pass) {
    console.warn(`Agent ${name} opening bid ${proposed.amount} exceeds cap ${maxBid} — passing.`);
    return { move: pass, reasoning: `Minimum required bid exceeds my hand's max opening bid (${maxBid}); passing.` };
  }

  // No legal bid ≤ cap and no pass available (edge case) — keep the proposal.
  return { move: proposed, reasoning: '' };
}

function stripMarkdownFences(text: string): string {
  // Remove markdown code fences if LLM wraps JSON in them
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned.trim();
}

export async function getAgentDecision(
  profile: AgentProfile,
  state: PlayerViewState,
): Promise<{ move: LegalMove; reasoning: string }> {
  const legalMoves = state.legalMoves;
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  let system: string;
  let user: string;

  const phase = state.phase;
  if (phase === 'bidding') {
    ({ system, user } = buildBiddingPrompt(profile, state));
  } else if (phase === 'rebidding') {
    ({ system, user } = buildRebiddingPrompt(profile, state));
  } else if (phase === 'selectingTrump') {
    ({ system, user } = buildTrumpSelectionPrompt(profile, state));
  } else {
    ({ system, user } = buildPlayPrompt(profile, state));
  }

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  // Try up to 2 times only on JSON parse failures.
  // Valid JSON with unmatched action goes straight to fallback.
  let lastParseError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await callLLM(
        profile.provider,
        profile.model,
        messages,
        profile.temperature,
        { type: 'json_object' },
      );

      const cleaned = stripMarkdownFences(response);
      const parsed: AgentDecision = JSON.parse(cleaned);
      const move = parseDecision(parsed, legalMoves);

      if (move) {
        // Enforce the conservative opening-bid cap in the 4-card bidding phase.
        if (state.phase === 'bidding' && move.type === 'bid') {
          const clamped = clampOpeningBid(profile.name, state, move);
          return {
            move: clamped.move,
            reasoning: clamped.reasoning || parsed.reasoning || 'No reasoning provided',
          };
        }
        return { move, reasoning: parsed.reasoning || 'No reasoning provided' };
      }

      // Valid JSON but action didn't match any legal move — no retry, go to fallback
      const legalTypes = [...new Set(legalMoves.map(m => m.type))];
      console.warn(
        `Agent ${profile.name} action "${parsed.action}" not legal. Legal: [${legalTypes.join(', ')}]. Using fallback.`
      );
      break;
    } catch (error) {
      // JSON parse error or network issue — retry once
      lastParseError = (error as Error).message;
      console.warn(`Agent ${profile.name} attempt ${attempt} failed:`, lastParseError);
      if (attempt < 2) {
        messages.push({
          role: 'user' as const,
          content: 'Your previous response was not valid JSON or had an error. Respond with ONLY valid JSON matching one of the allowed actions. No markdown, no extra text.',
        });
        continue;
      }
    }
  }

  // All retries exhausted — use smart fallback
  return smartFallback(profile.name, state, legalMoves);
}

function cardPoints(rank: Rank): number {
  return rank === 'J' ? 3 : rank === '9' ? 2 : (rank === 'A' || rank === '10') ? 1 : 0;
}

const RANK_VALUE: Record<Rank, number> = { J: 7, '9': 6, A: 5, '10': 4, K: 3, Q: 2, '8': 1, '7': 0 };

function smartFallback(
  name: string,
  state: PlayerViewState,
  legalMoves: LegalMove[],
): { move: LegalMove; reasoning: string } {
  // Prefer non-pass moves in bidding — but respect the deterministic opening-bid cap.
  const bidMoves = legalMoves.filter(m => m.type === 'bid') as { type: 'bid'; amount: number }[];
  if (bidMoves.length > 0) {
    // The opening-bid cap applies ONLY to the 4-card bidding phase.
    // During the rebid phase (23+ after the 8-card deal) the low bids are
    // already excluded by the engine, so pick the lowest legal bid.
    const openingBid = state.phase === 'bidding';
    const { maxBid } = openingBid ? evaluateOpeningHand(state.hand) : { maxBid: 28 };
    const minBid = bidMoves[0].amount;
    if (openingBid && minBid > maxBid) {
      // Every legal bid exceeds the cap — prefer passing over an overbid.
      const passMove = legalMoves.find(m => m.type === 'pass');
      if (passMove) {
        console.warn(`Agent ${name} using fallback pass (min bid ${minBid} exceeds cap ${maxBid})`);
        return { move: passMove, reasoning: `Fallback: pass (hand max ${maxBid})` };
      }
    }
    // Pick the LOWEST legal bid (conservative — avoid reckless overbids).
    const low = bidMoves[0];
    console.warn(`Agent ${name} using fallback bid: ${low.amount}`);
    return { move: low, reasoning: 'Fallback: conservative bid' };
  }

  // Prefer passing over nothing when no bid is possible
  const passMove = legalMoves.find(m => m.type === 'pass');
  if (passMove) {
    console.warn(`Agent ${name} using fallback pass`);
    return { move: passMove, reasoning: 'Fallback: pass' };
  }

  // Trump selection: prefer keeping the current trump if changing is optional.
  if (legalMoves.some(m => m.type === 'keepTrump')) {
    console.warn(`Agent ${name} using fallback keepTrump`);
    return { move: { type: 'keepTrump' } as LegalMove, reasoning: 'Fallback: keep trump' };
  }

  // For play: discard the LOWEST-VALUE card, never waste points.
  const playMoves = legalMoves.filter(
    m => m.type === 'playCard' || m.type === 'selectTrump'
  ) as { type: 'playCard' | 'selectTrump'; card: Card }[];

  if (playMoves.length > 0) {
    const leadSuit = state.currentTrick.leadSuit;
    const cards = playMoves.map(m => m.card);

    let chosen: Card;
    if (leadSuit === null) {
      // Leading — dump the least valuable card (0-point, low rank)
      cards.sort((a, b) =>
        cardPoints(a.rank) - cardPoints(b.rank) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      chosen = cards[0];
    } else {
      const followers = cards.filter(c => c.suit === leadSuit);
      if (followers.length > 0) {
        // Must follow suit — play the lowest card of that suit (preserve high cards)
        followers.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
        chosen = followers[0];
      } else {
        // Void — discard the lowest point-value card, never waste J/9/A/10
        cards.sort((a, b) =>
          cardPoints(a.rank) - cardPoints(b.rank) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
        chosen = cards[0];
      }
    }

    console.warn(`Agent ${name} using fallback play: ${chosen.rank}${chosen.suit}`);
    return { move: { type: 'playCard', card: chosen } as LegalMove, reasoning: 'Fallback: discard lowest value' };
  }

  // Last resort: first legal move
  console.warn(`Agent ${name} using generic fallback: ${legalMoves[0].type}`);
  return { move: legalMoves[0], reasoning: 'Fallback: generic' };
}

function parseDecision(decision: AgentDecision, legalMoves: LegalMove[]): LegalMove | null {
  const { action, bidAmount, cardSuit, cardRank } = decision;

  if (action === 'bid' && bidAmount) {
    return legalMoves.find(
      m => m.type === 'bid' && (m as { type: 'bid'; amount: number }).amount === bidAmount,
    ) || null;
  }

  if (action === 'pass') {
    return legalMoves.find(m => m.type === 'pass') || null;
  }

  if (action === 'callTrump') {
    return legalMoves.find(m => m.type === 'callTrump') || null;
  }

  if (action === 'showPair') {
    return legalMoves.find(m => m.type === 'showPair') || null;
  }

  if (action === 'keepTrump') {
    return legalMoves.find(m => m.type === 'keepTrump') || null;
  }

  if ((action === 'playCard' || action === 'selectTrump') && cardSuit && cardRank) {
    const card: Card = { suit: cardSuit as Suit, rank: cardRank as Rank };
    return legalMoves.find(
      m => (m.type === 'playCard' || m.type === 'selectTrump') &&
           (m as { card: Card }).card.suit === card.suit &&
           (m as { card: Card }).card.rank === card.rank,
    ) || null;
  }

  return null;
}
