// Prompt templates for AI agent decisions

import type { PlayerViewState } from '@/engine/types';
import { formatCard } from '@/engine/cards';
import type { AgentProfile } from './profiles';

function describeHand(hand: PlayerViewState['hand']): string {
  return hand.map(c => formatCard(c)).join(', ');
}

function buildGameRulesContext(): string {
  return `You are playing Twenty-eight (Thuruppu/Irupathiyettu), a 4-player Indian trick-taking card game.

RULES:
- 32 cards: J, 9, A, 10, K, Q, 8, 7 of each suit (♥♦♣♠)
- Card ranking (high→low): J > 9 > A > 10 > K > Q > 8 > 7
- Card points: J=3, 9=2, A=1, 10=1, K/Q/8/7=0. Total: 28 points.
- 4 players in fixed teams: South+North (Team 0) vs West+East (Team 1)
- Play is clockwise (0→1→2→3→0)
- Minimum bid: 14. Maximum bid: 28. Must bid higher than previous.

TRUMP & PLAY:
- Highest bidder chooses trump suit and places a trump card face-down.
- Phase 1 (before trump revealed): Trump has NO special power. Highest of led suit wins.
- Phase 2 (after trump revealed): Trump beats all other suits. Must follow suit.
- Bidder cannot lead trump in Phase 1 (unless only trump held or trump already led).
- When unable to follow suit in Phase 1: can call for trump to be revealed (then must play trump if held).
- Pair rule: Holding both K and Q of trump allows showing Pair — bidder's pair reduces bid by 4, defender's pair increases bid by 4.
- First team to ±6 match points wins.

Respond with valid JSON only.`;
}

export function buildBiddingPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

BIDDING PHASE: You must either bid higher than the current bid (or at least 14 if no bid) or pass.
Consider your cards carefully. Bid high if you have strong cards (high J, 9, A, 10) especially in one suit.
Pass if your hand is weak.`;

  const currentBid = state.bid ? state.bid.amount : 'none';
  const bidHistory = state.bidHistory
    .map(b => `Player ${b.player}: ${b.pass ? 'PASS' : `Bid ${b.amount}`}`)
    .join('\n');

  const user = `CURRENT GAME STATE:
Your hand (4 cards): ${describeHand(state.hand)}
Current bid: ${currentBid}
Bid history:\n${bidHistory || '(no bids yet)'}
Minimum bid you can make: ${state.bid ? state.bid.amount + 1 : 14}

You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your strategy",
  "action": "bid" | "pass",
  "bidAmount": number (only if action is "bid")
}`;

  return { system, user };
}

export function buildPlayPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const trumpStatus = state.trumpRevealed
    ? `Trump is ${state.trumpSuit}. Phase 2: trump is active.`
    : 'Trump is NOT revealed yet. Phase 1: trump has no special power.';

  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

PLAY PHASE: You must play a card. Play your strongest card to win the trick if beneficial,
or discard low cards if you cannot win. Consider your partner's and opponents' likely hands.`;

  const leadSuit = state.currentTrick.leadSuit
    ? `Lead suit: ${state.currentTrick.leadSuit}`
    : 'You are leading this trick.';

  const trickCards = state.currentTrick.cards
    .map((c, i) => c ? `Player ${i}: ${formatCard(c.card)}` : null)
    .filter(Boolean)
    .join(', ');

  const tricksWon = state.tricks
    .filter(t => t.winner === state.playerIndex || t.winner === (state.playerIndex + 2) % 4)
    .reduce((sum, t) => sum + t.points, 0);

  const legalMoves = state.legalMoves
    .filter(m => m.type === 'playCard')
    .map(m => formatCard((m as any).card));

  const pairInfo = state.bidderPairShown || state.defenderPairShown
    ? `Pair shown: ${state.bidderPairShown ? 'bidder' : 'defender'} — bid adjusted.`
    : '';

  const user = `CURRENT GAME STATE:
Your hand: ${describeHand(state.hand)}
${trumpStatus}
${leadSuit}
Trick so far: ${trickCards || '(empty)'}
Trick number: ${state.trickNumber || '?'} of 8
Bid: ${state.bid?.amount || '?'} by Player ${state.bid?.bidder || '?'}
Points your team has won this round: ${tricksWon}
${pairInfo}

Legal cards you can play: ${legalMoves.join(', ')}

You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your strategy",
  "action": "playCard" | "callTrump" | "showPair",
  "cardSuit": "hearts" | "diamonds" | "clubs" | "spades" (only for playCard),
  "cardRank": "J" | "9" | "A" | "10" | "K" | "Q" | "8" | "7" (only for playCard)
}`;

  return { system, user };
}

export function buildTrumpSelectionPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

TRUMP SELECTION: You won the bidding. Choose which suit will be trump and which specific card you'll place face-down.
Pick a suit where you have strong cards (J, 9, A, 10) and ideally length (many cards of that suit).`;

  const user = `CURRENT GAME STATE:
Your hand (4 cards): ${describeHand(state.hand)}
Your bid: ${state.bid?.amount}
You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your trump choice",
  "action": "selectTrump",
  "cardSuit": "hearts" | "diamonds" | "clubs" | "spades",
  "cardRank": "J" | "9" | "A" | "10" | "K" | "Q" | "8" | "7"
}`;

  return { system, user };
}
