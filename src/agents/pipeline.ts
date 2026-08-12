// Agent decision pipeline — full flow from state to validated move

import type { PlayerViewState, Card, LegalMove, Suit, Rank } from '@/engine/types';
import type { AgentProfile } from './profiles';
import { callLLM } from './providers';
import { buildBiddingPrompt, buildPlayPrompt, buildTrumpSelectionPrompt } from './prompts';

interface AgentDecision {
  action: string;
  bidAmount?: number;
  cardSuit?: string;
  cardRank?: string;
  reasoning?: string;
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
  return smartFallback(profile.name, legalMoves);
}

function smartFallback(name: string, legalMoves: LegalMove[]): { move: LegalMove; reasoning: string } {
  // Prefer non-pass moves in bidding
  const bidMoves = legalMoves.filter(m => m.type === 'bid') as { type: 'bid'; amount: number }[];
  if (bidMoves.length > 0) {
    // Pick the middle bid (balanced strategy)
    const mid = bidMoves[Math.floor(bidMoves.length / 2)];
    console.warn(`Agent ${name} using fallback bid: ${mid.amount}`);
    return { move: mid, reasoning: 'Fallback: balanced bid' };
  }

  // For play: prefer highest-ranked playable card
  const playMoves = legalMoves.filter(
    m => m.type === 'playCard' || m.type === 'selectTrump'
  ) as { type: 'playCard' | 'selectTrump'; card: Card }[];

  if (playMoves.length > 0) {
    // Pick highest-ranked card (J=7, 9=6, etc.)
    const rankOrder: Record<Rank, number> = { J: 7, '9': 6, A: 5, '10': 4, K: 3, Q: 2, '8': 1, '7': 0 };
    playMoves.sort((a, b) => rankOrder[b.card.rank] - rankOrder[a.card.rank]);
    const best = playMoves[0];
    console.warn(`Agent ${name} using fallback play: ${best.card.rank}${best.card.suit}`);
    return { move: best, reasoning: 'Fallback: highest card' };
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
