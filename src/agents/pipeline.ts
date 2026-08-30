// Agent decision pipeline — full flow from state to validated move

import type { PlayerViewState, Card, LegalMove, Suit, Rank } from '@/engine/types';
import type { MoveEvaluation } from '@/engine/search';
import type { AgentProfile } from './profiles';
import { callLLM } from './providers';
import { buildBiddingPrompt, buildPlayPrompt, buildTrumpSelectionPrompt, buildRebiddingPrompt, buildExplainPrompt } from './prompts';
import { evaluateOpeningHand, evaluateRebidHand, chooseMaxLegalBid } from '@/engine/bidding';
import { log } from '@/lib/log';
import { describeMove, withSpan } from '@/lib/tracing';

interface AgentDecision {
  action?: string;
  bidAmount?: number | string;
  cardSuit?: string;
  cardRank?: string;
  reasoning?: string;
  // Some models use `move` or `type` as the action key instead of `action`.
  move?: string;
  type?: string;
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
    log.warn(`Agent ${name} opening bid ${proposed.amount} clamped to ${capped} (max ${maxBid}).`);
    return {
      move: { type: 'bid', amount: capped },
      reasoning: `Opening bid capped at ${maxBid} with only 4 cards; bidding ${capped}.`,
    };
  }

  const pass = state.legalMoves.find((m) => m.type === 'pass');
  if (pass) {
    log.warn(`Agent ${name} opening bid ${proposed.amount} exceeds cap ${maxBid} — passing.`);
    return { move: pass, reasoning: `Minimum required bid exceeds my hand's max opening bid (${maxBid}); passing.` };
  }

  // No legal bid ≤ cap and no pass available (edge case) — keep the proposal.
  return { move: proposed, reasoning: '' };
}

/**
 * Enforce the deterministic rebid cap: with all 8 cards seen, a 24+ bid is
 * a near-solo contract and must not exceed the hand's computed maximum.
 * Hands that don't support even 24 are forced to pass.
 */
function clampRebid(
  name: string,
  state: PlayerViewState,
  proposed: { type: 'bid'; amount: number },
): { move: LegalMove; reasoning: string } {
  const { maxRebid } = evaluateRebidHand(state.hand);
  if (proposed.amount <= maxRebid) {
    return { move: proposed, reasoning: '' };
  }

  const capped = chooseMaxLegalBid(state.legalMoves, maxRebid);
  if (capped !== null) {
    log.warn(`Agent ${name} rebid ${proposed.amount} clamped to ${capped} (max ${maxRebid}).`);
    return {
      move: { type: 'bid', amount: capped },
      reasoning: `Rebid capped at ${maxRebid} — hand does not support ${proposed.amount}; bidding ${capped}.`,
    };
  }

  const pass = state.legalMoves.find((m) => m.type === 'pass');
  if (pass) {
    log.warn(`Agent ${name} rebid ${proposed.amount} exceeds cap ${maxRebid} — passing.`);
    return { move: pass, reasoning: `Hand supports at most a ${maxRebid} rebid — passing.` };
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

/**
 * Extract the JSON decision from a raw LLM response. Reasoning models
 * (gpt-oss, Qwen3, …) wrap their final answer after a
 * `<|channel|>final<|message|>` marker inside the `content` field. Fall back to
 * the first `{`…last `}` span, then to the raw text. Returns the first
 * candidate that parses as JSON, else the raw cleaned text (so the caller's
 * JSON.parse throws and triggers a corrective retry).
 */
export function extractJson(text: string): string {
  const cleaned = stripMarkdownFences(text);
  if (!cleaned) return cleaned;

  const candidates: string[] = [];

  const finalMarker = '<|channel|>final<|message|>';
  const idx = cleaned.lastIndexOf(finalMarker);
  if (idx !== -1) {
    candidates.push(cleaned.slice(idx + finalMarker.length).trim());
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  candidates.push(cleaned);

  for (const candidate of candidates) {
    if (candidate) {
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // try the next candidate
      }
    }
  }
  return cleaned;
}

export async function getAgentDecision(
  profile: AgentProfile,
  state: PlayerViewState,
  table?: MoveEvaluation[],
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
    ({ system, user } = buildPlayPrompt(profile, state, table));
  }

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  return withSpan(
    'agent.decision',
    {
      'agent.name': profile.name,
      'agent.profile_id': profile.id,
      'game.phase': phase,
      'llm.provider': profile.provider,
      'llm.model': profile.model,
      'llm.temperature': profile.temperature,
    },
    async (span) => {
      // Retry up to 2 times on JSON parse failures AND on valid-JSON responses
      // whose action doesn't map to a legal move (missing/wrong key, empty `{}`).
      let lastParseError: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await callLLM(
            profile.provider,
            profile.model,
            messages,
            profile.temperature,
            { type: 'json_object' },
            attempt,
          );

          const cleaned = extractJson(response);
          const parsed: AgentDecision = JSON.parse(cleaned);
          const move = parseDecision(parsed, legalMoves);

          if (move) {
            span.setAttribute('agent.move', describeMove(move));
            // Enforce the conservative opening-bid cap in the 4-card bidding phase.
            if (state.phase === 'bidding' && move.type === 'bid') {
              const clamped = clampOpeningBid(profile.name, state, move);
              span.setAttribute('agent.move', describeMove(clamped.move));
              return {
                move: clamped.move,
                reasoning: clamped.reasoning || parsed.reasoning || 'No reasoning provided',
              };
            }
            // Enforce the deterministic rebid cap in the 8-card rebid phase.
            if (state.phase === 'rebidding' && move.type === 'bid') {
              const clamped = clampRebid(profile.name, state, move);
              span.setAttribute('agent.move', describeMove(clamped.move));
              return {
                move: clamped.move,
                reasoning: clamped.reasoning || parsed.reasoning || 'No reasoning provided',
              };
            }
            return { move, reasoning: parsed.reasoning || 'No reasoning provided' };
          }

          // Valid JSON but no usable action (missing/wrong key, empty `{}`, etc.) —
          // retry once with a corrective hint before falling back.
          const legalTypes = [...new Set(legalMoves.map(m => m.type))];
          log.warn(
            `Agent ${profile.name} action "${parsed.action}" not legal (attempt ${attempt}). Legal: [${legalTypes.join(', ')}].`
          );
          if (attempt < 2) {
            messages.push({
              role: 'user' as const,
              content: `Your response parsed as JSON but is missing a valid "action". Legal actions: [${legalTypes.join(', ')}]. Respond with ONLY valid JSON containing the required fields. No markdown, no extra text.`,
            });
            continue;
          }
          break;
        } catch (error) {
          // JSON parse error or network issue — retry once
          lastParseError = (error as Error).message;
          log.warn(`Agent ${profile.name} attempt ${attempt} failed:`, lastParseError);
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
      span.setAttribute('agent.fallback_used', true);
      if (lastParseError) span.setAttribute('llm.parse_error', lastParseError);
      const fallback = smartFallback(profile.name, state, legalMoves, table);
      span.setAttribute('agent.move', describeMove(fallback.move));
      return fallback;
    }
  );
}

/** Generate a natural-language explanation for an already-chosen (search) move. */
export async function getExplanation(
  profile: AgentProfile,
  state: PlayerViewState,
  chosen: { label: string; pMakeContract: number },
  table: MoveEvaluation[],
): Promise<string> {
  const { system, user } = buildExplainPrompt(profile, state, chosen, table);
  return withSpan(
    'agent.explanation',
    {
      'agent.name': profile.name,
      'agent.profile_id': profile.id,
      'game.phase': state.phase,
      'llm.provider': profile.provider,
      'llm.model': profile.model,
      'llm.temperature': profile.temperature,
    },
    async () => {
      const response = await callLLM(profile.provider, profile.model, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], profile.temperature, { type: 'json_object' });
      const cleaned = extractJson(response);
      try {
        const parsed = JSON.parse(cleaned) as { reasoning?: string };
        if (parsed.reasoning) return parsed.reasoning;
      } catch { /* fall through */ }
      return chosen.label;
    }
  );
}

function cardPoints(rank: Rank): number {
  return rank === 'J' ? 3 : rank === '9' ? 2 : (rank === 'A' || rank === '10') ? 1 : 0;
}

const RANK_VALUE: Record<Rank, number> = { J: 7, '9': 6, A: 5, '10': 4, K: 3, Q: 2, '8': 1, '7': 0 };

function smartFallback(
  name: string,
  state: PlayerViewState,
  legalMoves: LegalMove[],
  table?: MoveEvaluation[],
): { move: LegalMove; reasoning: string } {
  // Prefer non-pass moves in bidding — but respect the deterministic opening-bid cap.
  const bidMoves = legalMoves.filter(m => m.type === 'bid') as { type: 'bid'; amount: number }[];
  if (bidMoves.length > 0) {
    // The opening-bid cap applies ONLY to the 4-card bidding phase; the
    // rebid cap applies to the 8-card rebid phase. Otherwise pick the lowest
    // legal bid (conservative — avoid reckless overbids).
    const openingBid = state.phase === 'bidding';
    const rebidding = state.phase === 'rebidding';
    const cap = openingBid
      ? evaluateOpeningHand(state.hand).maxBid
      : rebidding
        ? evaluateRebidHand(state.hand).maxRebid
        : 28;
    const minBid = bidMoves[0].amount;
    if ((openingBid || rebidding) && minBid > cap) {
      // Every legal bid exceeds the cap — prefer passing over an overbid.
      const passMove = legalMoves.find(m => m.type === 'pass');
      if (passMove) {
        log.warn(`Agent ${name} using fallback pass (min bid ${minBid} exceeds cap ${cap})`);
        return { move: passMove, reasoning: `Fallback: pass (hand max ${cap})` };
      }
    }
    // Pick the LOWEST legal bid (conservative — avoid reckless overbids).
    const low = bidMoves[0];
    log.warn(`Agent ${name} using fallback bid: ${low.amount}`);
    return { move: low, reasoning: 'Fallback: conservative bid' };
  }

  // Prefer passing over nothing when no bid is possible
  const passMove = legalMoves.find(m => m.type === 'pass');
  if (passMove) {
    log.warn(`Agent ${name} using fallback pass`);
    return { move: passMove, reasoning: 'Fallback: pass' };
  }

  // Trump selection: prefer keeping the current trump if changing is optional.
  if (legalMoves.some(m => m.type === 'keepTrump')) {
    log.warn(`Agent ${name} using fallback keepTrump`);
    return { move: { type: 'keepTrump' } as LegalMove, reasoning: 'Fallback: keep trump' };
  }

  // For play: when the LLM failed, prefer the Monte-Carlo search's top move if
  // a table was computed (hybrid mode). The search is deterministic, always
  // legal, and already honors the no-gift-points guard — far stronger than the
  // naive heuristic below. Falls back to discarding the LOWEST-VALUE card only
  // when no search result exists.
  const playMoves = legalMoves.filter(
    m => m.type === 'playCard' || m.type === 'selectTrump'
  ) as { type: 'playCard' | 'selectTrump'; card: Card }[];

  if (playMoves.length > 0) {
    if (table && table.length > 0) {
      const top = [...table].sort((a, b) => b.pMakeContract - a.pMakeContract)[0];
      if (top && (top.move.type === 'playCard' || top.move.type === 'callTrump')) {
        const pct = Math.round(top.pMakeContract * 100);
        log.warn(`Agent ${name} falling back to search top move: ${top.label} (${pct}%)`);
        return { move: top.move, reasoning: `Fallback: ${top.label} (${pct}% to make the bid)` };
      }
    }

    const leadSuit = state.currentTrick.leadSuit;
    const cards = playMoves.map(m => m.card);

    let chosen: Card;
    let reason: string;
    if (leadSuit === null) {
      // Leading — dump the least valuable card (0-point, low rank)
      cards.sort((a, b) =>
        cardPoints(a.rank) - cardPoints(b.rank) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
      chosen = cards[0];
      reason = 'Fallback: dump least valuable card';
    } else {
      const followers = cards.filter(c => c.suit === leadSuit);
      if (followers.length > 0) {
        // Must follow suit — play the lowest card of that suit (preserve high cards)
        followers.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
        chosen = followers[0];
        reason = 'Fallback: lowest card of led suit';
      } else {
        // Void — discard the lowest point-value card, never waste J/9/A/10
        cards.sort((a, b) =>
          cardPoints(a.rank) - cardPoints(b.rank) || RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
        chosen = cards[0];
        reason = 'Fallback: discard lowest point value';
      }
    }

    log.warn(`Agent ${name} using fallback play: ${chosen.rank}${chosen.suit}`);
    return { move: { type: 'playCard', card: chosen } as LegalMove, reasoning: reason };
  }

  // Last resort: first legal move
  log.warn(`Agent ${name} using generic fallback: ${legalMoves[0].type}`);
  return { move: legalMoves[0], reasoning: 'Fallback: generic' };
}

export function parseDecision(decision: AgentDecision, legalMoves: LegalMove[]): LegalMove | null {
  const rawAction = decision.action ?? decision.move ?? decision.type;
  const action = typeof rawAction === 'string' ? rawAction.trim().toLowerCase() : '';
  const bidAmount =
    typeof decision.bidAmount === 'number' ? decision.bidAmount : Number(decision.bidAmount);
  const cardSuit = decision.cardSuit?.trim();
  const cardRank = decision.cardRank?.trim();

  if (action === 'bid' && !Number.isNaN(bidAmount)) {
    return legalMoves.find(
      m => m.type === 'bid' && (m as { type: 'bid'; amount: number }).amount === bidAmount,
    ) || null;
  }

  if (action === 'pass') {
    return legalMoves.find(m => m.type === 'pass') || null;
  }

  if (action === 'calltrump') {
    return legalMoves.find(m => m.type === 'callTrump') || null;
  }

  if (action === 'showpair') {
    return legalMoves.find(m => m.type === 'showPair') || null;
  }

  if (action === 'keeptrump') {
    return legalMoves.find(m => m.type === 'keepTrump') || null;
  }

  if ((action === 'playcard' || action === 'selecttrump') && cardSuit && cardRank) {
    const card: Card = { suit: cardSuit as Suit, rank: cardRank as Rank };
    return legalMoves.find(
      m => (m.type === 'playCard' || m.type === 'selectTrump') &&
           (m as { card: Card }).card.suit === card.suit &&
           (m as { card: Card }).card.rank === card.rank,
    ) || null;
  }

  return null;
}
