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
- Play and deal are COUNTER-CLOCKWISE (0→3→2→1→0)
- Minimum bid: 14. Maximum bid: 28. Must bid higher than previous.

TRUMP & PLAY:
- Highest bidder chooses trump suit and places a trump card face-down.
- Phase 1 (before trump revealed): Trump has NO special power. Highest of led suit wins.
- Phase 2 (after trump revealed): Trump beats all other suits. Must follow suit.
- Bidder cannot lead trump in Phase 1 (unless only trump held or trump already led).
- Pair rule: Holding both K and Q of trump allows showing Pair — bidder's pair reduces bid by 4, defender's pair increases bid by 4.
- First team to ±6 match points wins.

CALLING TRUMP (Phase 1, when you cannot follow the led suit):
- You may "callTrump" BEFORE playing a card. The bidder then reveals the face-down trump card to everyone.
- You do NOT know the trump suit until it is revealed — calling is a strategic gamble.
- After calling, you MUST play a trump card to the trick if you have one (else discard any card).
- Strategic considerations:
  * If your TEAM is already winning the current trick, do NOT call trump — instead discard a low card, or discard a point card to add value to your team's win.
  * If the OPPOSING team is winning the current trick, calling trump may let you capture it — especially valuable if the trick contains high-point cards (J, 9, A, 10).
  * Calling trump reveals the trump suit to EVERYONE, giving opponents an advantage in later tricks. Call only when it materially helps you this trick.
  * A high trump in hand (J or 9) makes calling more attractive — you can win the trick outright.

SCORING (game points, by bid bracket):
- Bid ≤19: bidding team gains +1 if successful, loses −2 if failed.
- Bid 20–23: gains +2 if successful, loses −3 if failed.
- Bid 24–27: gains +3 if successful, loses −4 if failed.
- Bid 28: gains +4 if successful, loses −5 if failed.

STRATEGY:
- Fattening trick: if your partner is clearly winning the trick and you cannot follow suit, discard a high point card (9=2 or 10=1) to deposit points into your team's win — but only if you are confident your partner wins.
- Silent discard: if your partner is winning and you hold strong trumps, discard an off-suit card rather than calling trump, to keep your trump hidden for a bigger cut later.
- Defensive void trap: as a defender, do NOT call trump on a low card; wait until the bidder leads a high-value card (A or 10) before revealing trump, so your cut steals major points.
- Trump flush: if you hold both J and 9 of trump, after trump is revealed consider leading the J to strip opponents of their trumps and protect your team's high cards.
- Do not waste trump early: if your partner already won with a trump, avoid leading another trump unless fishing for opponents' remaining high trumps.
- Flush opponent voids: if you notice an opponent is out of a suit, keep leading that suit to force them to waste trumps or bleed points.

Respond with valid JSON only.`;
}

export function buildBiddingPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

BIDDING PHASE: You have only 4 cards now. You must either bid higher than the current bid (or at least 14 if no bid) or pass.

CRITICAL — BIDDING DISCIPLINE:
- You have only 4 cards in hand right now. You will receive 4 MORE cards after bidding, and then get a SECOND chance to raise the bid to 23+ (the "rebid").
- Therefore, with only 4 cards, NEVER bid above 20-21. Bidding 24, 25, or 28 on just 4 cards is reckless and almost always loses.
- Reserve high bids (23+) for the REBID phase, after you have seen all 8 cards and know your hand is strong.
- Bid 14-18 with a decent hand, 19-21 only with a very strong 4-card hand (e.g. two Jacks or a Jack+9 in the same suit).
- Pass if your 4 cards are weak (few point cards, no suit strength).
- Do not get dragged into a bidding war — if opponents keep raising, pass and let them overcommit.`;

  const currentBid = state.bid ? state.bid.amount : 'none';
  const bidHistory = state.bidHistory
    .map(b => `Player ${b.player}: ${b.pass ? 'PASS' : `Bid ${b.amount}`}`)
    .join('\n');

  const user = `CURRENT GAME STATE:
Your hand (4 cards): ${describeHand(state.hand)}
Current bid: ${currentBid}
Bid history:\n${bidHistory || '(no bids yet)'}
Minimum bid you can make: ${state.bid ? state.bid.amount + 1 : 14}
(Remember: you only have 4 cards — do not bid above 20-21. Save 23+ for the rebid after you see all 8 cards.)

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

PLAY PHASE: You must play a card (or call trump in Phase 1 if you cannot follow suit).
Play your strongest card to win the trick if beneficial, or discard low cards if you cannot win.
Consider your partner's and opponents' likely hands.`;

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

  const canCallTrump = state.legalMoves.some(m => m.type === 'callTrump');

  // Determine current trick winner and their team
  let trickWinnerInfo = '';
  const placedCards = state.currentTrick.cards.filter(c => c !== null);
  if (placedCards.length > 0 && state.currentTrick.leadSuit) {
    const leadSuitCards = placedCards.filter(c => c!.card.suit === state.currentTrick.leadSuit);
    if (leadSuitCards.length > 0) {
      const best = leadSuitCards.reduce((best, c) => {
        const rankOrder: Record<string, number> = { J: 7, '9': 6, A: 5, '10': 4, K: 3, Q: 2, '8': 1, '7': 0 };
        return rankOrder[c!.card.rank] > rankOrder[best!.card.rank] ? c : best;
      });
      const winnerTeam = best!.player % 2;
      const myTeam = state.playerIndex % 2;
      trickWinnerInfo = winnerTeam === myTeam
        ? `YOUR TEAM is currently winning this trick (Player ${best!.player} leads with ${formatCard(best!.card)}).`
        : `OPPONENT TEAM is currently winning this trick (Player ${best!.player} leads with ${formatCard(best!.card)}).`;
    }
  }

  const trickPoints = placedCards.reduce((sum, c) => sum + (c ? pointValue(c.card.rank) : 0), 0);

  const pairInfo = state.bidderPairShown || state.defenderPairShown
    ? `Pair shown: ${state.bidderPairShown ? 'bidder' : 'defender'} — bid adjusted.`
    : '';

  const callTrumpHint = canCallTrump
    ? `\nIMPORTANT: You cannot follow the led suit. You may either (1) discard any card, or (2) "callTrump" to reveal the trump suit (then you must play trump if you hold any). ${trickWinnerInfo} Points currently at stake in this trick: ${trickPoints}. Decide strategically: call trump to capture a trick your team is losing, or discard if your team already wins it.`
    : '';

  const user = `CURRENT GAME STATE:
Your hand: ${describeHand(state.hand)}
${trumpStatus}
${leadSuit}
Trick so far: ${trickCards || '(empty)'}
${trickWinnerInfo}
Trick number: ${state.trickNumber || '?'} of 8
Bid: ${state.bid?.amount || '?'} by Player ${state.bid?.bidder || '?'}
Points your team has won this round: ${tricksWon}
Points at stake in current trick: ${trickPoints}
${pairInfo}
${callTrumpHint}

Legal cards you can play: ${legalMoves.join(', ')}
${canCallTrump ? 'You may also "callTrump" instead of playing a card.' : ''}

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

function pointValue(rank: string): number {
  const map: Record<string, number> = { J: 3, '9': 2, A: 1, '10': 1 };
  return map[rank] ?? 0;
}

export function buildRebiddingPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

REBID PHASE: You have now seen all 8 of your cards. You may raise the bid to at least 24 (or higher than the current bid if it is already 24+) if you are confident your team can win that many points, or pass to keep the current bid.`;

  const user = `CURRENT GAME STATE:
Your hand (8 cards): ${describeHand(state.hand)}
Current bid: ${state.bid?.amount} by Player ${state.bid?.bidder}
Minimum rebid: ${Math.max(24, (state.bid?.amount ?? 0) + 1)}
You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your strategy",
  "action": "bid" | "pass",
  "bidAmount": number (only if action is "bid")
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
