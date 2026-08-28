// Prompt templates for AI agent decisions

import type { PlayerViewState, Card, TrickCard, Suit } from "@/engine/types";
import type { MoveEvaluation } from "@/engine/search";
import { formatCard, createDeck, getCardPoints, getRankValue } from "@/engine/cards";
import { getTrickWinner } from "@/engine/game";
import { evaluateOpeningHand, evaluateRebidHand } from "@/engine/bidding";
import type { AgentProfile } from "./profiles";

function describeHand(hand: PlayerViewState["hand"]): string {
  return hand.map((c) => formatCard(c)).join(", ");
}

/** Card-counting memory: played cards, remaining cards, and points won per team. */
function buildCardMemory(state: PlayerViewState): string {
  // Collect all played cards (completed tricks + current in-progress trick)
  const played: Card[] = [];
  for (const t of state.tricks) {
    for (const tc of t.cards) played.push(tc.card);
  }
  for (const c of state.currentTrick.cards) {
    if (c) played.push(c.card);
  }

  // Points won per team so far this round
  let team0Points = 0;
  let team1Points = 0;
  for (const t of state.tricks) {
    if (t.winner === 0 || t.winner === 2) team0Points += t.points;
    else team1Points += t.points;
  }
  const pointsRemaining = 28 - team0Points - team1Points;

  // Trick history summary
  const history = state.tricks.map(
    (t) =>
      `Trick: ${t.cards.map((c) => formatCard(c.card)).join(" ")} → won by Player ${t.winner} (${t.points} pts)`,
  );

  // Remaining (unaccounted) cards: not yet played, not in my own hand
  const remainingBySuit = getRemainingBySuit(state);
  const remaining = ["hearts", "diamonds", "clubs", "spades"].map(
    (s) => `${s}: ${(remainingBySuit[s as Suit] ?? []).map(formatCard).join(", ") || "(none)"}`,
  );

  const myTeam = state.teamIndex;
  const myTeamPoints = myTeam === 0 ? team0Points : team1Points;
  const oppPoints = myTeam === 0 ? team1Points : team0Points;

  return `CARD MEMORY (tricks already played this round):
${history.length > 0 ? history.join("\n") : "(no tricks completed yet)"}

POINTS WON SO FAR this round:
- Your team: ${myTeamPoints} pts
- Opponents: ${oppPoints} pts
- Points still in play: ${pointsRemaining} pts

CARDS STILL UNACCOUNTED (in other players' hands or not yet played):
${remaining.join("\n")}`;
}

/** Remaining (unaccounted) cards per suit: not yet played and not in my hand. */
function getRemainingBySuit(state: PlayerViewState): Record<Suit, Card[]> {
  const played: Card[] = [];
  for (const t of state.tricks) {
    for (const tc of t.cards) played.push(tc.card);
  }
  for (const c of state.currentTrick.cards) {
    if (c) played.push(c.card);
  }

  const playedSet = new Set(played.map((c) => `${c.suit}${c.rank}`));
  const handSet = new Set(state.hand.map((c) => `${c.suit}${c.rank}`));
  const remainingBySuit: Record<Suit, Card[]> = { hearts: [], diamonds: [], clubs: [], spades: [] };
  for (const c of createDeck()) {
    const key = `${c.suit}${c.rank}`;
    if (!playedSet.has(key) && !handSet.has(key)) {
      remainingBySuit[c.suit].push(c);
    }
  }
  return remainingBySuit;
}

/** Higher cards of `card.suit` still unaccounted for (could still beat `card`). */
function getHigherUnaccounted(card: Card, state: PlayerViewState): Card[] {
  return (getRemainingBySuit(state)[card.suit] ?? []).filter(
    (c) => getRankValue(c.rank) > getRankValue(card.rank),
  );
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
- OPENING bids (4 cards in hand) range 14 to 23 — a bid of 20+ is an "Honors" call.
- REBID (after all 8 cards are dealt) starts at 24 and goes up to 28.

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
- CRITICAL: Never keep trump hidden the entire round. If you hold trump and can win a valuable trick, open it.
- Strategic considerations:
  * If your TEAM is already winning the current trick, do NOT call trump — instead discard a low card, or discard a point card to add value to your team's win.
  * If the OPPOSING team is winning the current trick AND it has point cards (J, 9, A, 10), CALL trump to capture it.
  * Exception — worth discarding instead of calling: the current trick has ZERO or less then 2 points, and you hold a useless off-suit card (e.g. a lonely K/Q/8/7) you want to dump while keeping your trump for a later high-point trick.
  * A high trump in hand (J or 9) makes calling more attractive — you can win the trick outright.
  * If you have multiple trumps, using one to cut an opponent's point trick is almost always correct.

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
- Lead partner's void: if your partner discarded off-suit (they could not follow that led suit), they are void in it. Lead that suit next so they can cut with trump and win the trick.
- Opening lead (strong hand): with a strong suit, lead an Ace early to force opponents to burn their low tracking cards while your team locks the lead.
- Opening lead (weak hand): with a weak hand, lead an off-suit 7 or 8 to force opponents to play power cards, protecting your few good cards for the endgame.
- Lead safety: never lead a 9 (or J) while a higher card of that suit is still unaccounted for — if the J of your suit is still out, your 9 will be captured. Lead a low filler (7/8/K/Q) instead and save your high cards until their beaters are drawn out.
- Honors (20–23 bid) partner duty: if your partner bid 20–23, treat every point as precious. When the OPPONENT team is winning the current trick, do NOT throw point cards (J, 9, A, 10) into it — play your lowest card and let them win cheaply. Only dump point cards onto a trick YOUR team is already winning (fattening your partner).
- Thani (24+ bid) partner duty: if your partner bid 24+, stay out of their way — play your lowest cards and do not try to win tricks.
- Thani (24+ bid) defender duty: if an opponent bid 24+, save your single highest card to break just one trick — breaking one trick collapses their solo bid.

Respond with valid JSON only.`;
}

export function buildBiddingPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const { maxBid, points, note } = evaluateOpeningHand(state.hand);

  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

BIDDING PHASE: You have only 4 cards now. You must either bid higher than the current bid (or at least 14 if no bid) or pass.

CRITICAL — BIDDING DISCIPLINE:
- You have only 4 cards in hand right now. You will receive 4 MORE cards after bidding, and then get a SECOND chance to raise the bid to 24+ (the "rebid").
- HARD LIMIT: your 4-card hand supports a maximum opening bid of ${maxBid}. NEVER bid above ${maxBid} in this opening round.
- ${note}
- If the current bid is already at or above ${maxBid}, PASS — do not overcommit on only 4 cards.
- Reserve high bids (24+) for the REBID phase, after you have seen all 8 cards and know your hand is strong.
- Do not get dragged into a bidding war — if opponents keep raising, pass and let them overcommit.`;

  const currentBid = state.bid ? state.bid.amount : "none";
  const bidHistory = state.bidHistory
    .map((b) => `Player ${b.player}: ${b.pass ? "PASS" : `Bid ${b.amount}`}`)
    .join("\n");

  const user = `CURRENT GAME STATE:
Your hand (4 cards): ${describeHand(state.hand)}
Current bid: ${currentBid}
Bid history:\n${bidHistory || "(no bids yet)"}
Minimum bid you can make: ${state.bid ? state.bid.amount + 1 : 14}
Hand strength: ${points} points — max opening bid ${maxBid}. Do not bid above ${maxBid}. If the minimum required bid exceeds ${maxBid}, pass.

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
  table?: MoveEvaluation[],
): { system: string; user: string } {
  const trumpStatus = state.trumpRevealed
    ? `Trump is ${state.trumpSuit}. Phase 2: trump is active.`
    : "Trump is NOT revealed yet. Phase 1: trump has no special power.";

  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

PLAY PHASE: You must play a card (or call trump in Phase 1 if you cannot follow suit).
Play your strongest card to win the trick if beneficial, or discard low cards if you cannot win.
Consider your partner's and opponents' likely hands.`;

  const leadSuit = state.currentTrick.leadSuit
    ? `Lead suit: ${state.currentTrick.leadSuit}`
    : "You are leading this trick.";

  const trickCards = state.currentTrick.cards
    .map((c, i) => (c ? `Player ${i}: ${formatCard(c.card)}` : null))
    .filter(Boolean)
    .join(", ");

  const tricksWon = state.tricks
    .filter(
      (t) =>
        t.winner === state.playerIndex ||
        t.winner === (state.playerIndex + 2) % 4,
    )
    .reduce((sum, t) => sum + t.points, 0);

  const currentLeadSuit = state.currentTrick.leadSuit;
  const placedCards = state.currentTrick.cards.filter((c): c is TrickCard => c !== null);

  // Correctly determine the current trick winner (handles trump in Phase 2).
  let winningCard: TrickCard | null = null;
  if (currentLeadSuit && placedCards.length > 0) {
    const winnerIdx = getTrickWinner(placedCards, currentLeadSuit, state.trumpSuit, state.trumpRevealed);
    winningCard = placedCards.find((c) => c.player === winnerIdx) ?? null;
  }

  const trickWinnerInfo = winningCard
    ? winningCard.player % 2 === state.playerIndex % 2
      ? `YOUR TEAM is currently winning this trick (Player ${winningCard.player} with ${formatCard(winningCard.card)}).`
      : `OPPONENT TEAM is currently winning this trick (Player ${winningCard.player} with ${formatCard(winningCard.card)}).`
    : "";

  // Partner duty: dynamic, state-aware hint so the agent knows when its partner
  // holds an Honors (20–23) bid and must not leak points into opponent tricks.
  const partner = (state.playerIndex + 2) % 4;
  const partnerBid =
    state.bid?.bidder === partner && state.bid.amount >= 20 && state.bid.amount <= 23
      ? state.bid.amount
      : null;
  const opponentsWinning = winningCard && winningCard.player % 2 !== state.playerIndex % 2;
  const partnerDutyHint =
    partnerBid !== null && placedCards.length > 0
      ? opponentsWinning
        ? `\nPARTNER DUTY: your partner (Player ${partner}) bid ${partnerBid} (Honors). The OPPONENT team is winning this trick. Do NOT throw point cards (J/9/A/10) into it — play your lowest card and give it up cheaply.`
        : `\nPARTNER DUTY: your partner (Player ${partner}) bid ${partnerBid} (Honors). YOUR team is winning this trick — it is safe to fatten it with a point card if you cannot follow suit.`
      : "";

  // Annotate each legal card with whether it can beat the current winner, so
  // the LLM never misjudges card strength (e.g. 9 does NOT beat J). Also warn
  // when a higher card of that suit is STILL UNACCOUNTED — playing a point
  // card that an unplayed J/9/A can capture just gifts the points away.
  const legalMoves = state.legalMoves
    .filter((m) => m.type === "playCard")
    .map((m) => {
      const card = (m as { type: "playCard"; card: Card }).card;
      const label = formatCard(card);
      if (!winningCard || !currentLeadSuit || winningCard.player === state.playerIndex) return label;
      const beats =
        getTrickWinner(
          [...placedCards, { card, player: state.playerIndex }],
          currentLeadSuit,
          state.trumpSuit,
          state.trumpRevealed,
        ) === state.playerIndex;
      const higher = getHigherUnaccounted(card, state);
      const higherWarning =
        higher.length > 0 ? ` — BUT ${higher.map(formatCard).join(", ")} still unaccounted; if any opponent holds it, this card will be captured.` : "";
      return beats
        ? `${label} (beats ${formatCard(winningCard.card)}${higherWarning})`
        : `${label} (loses to ${formatCard(winningCard.card)})`;
    });

  const canCallTrump = state.legalMoves.some((m) => m.type === "callTrump");

  const trickPoints = placedCards.reduce(
    (sum, c) => sum + (c ? pointValue(c.card.rank) : 0),
    0,
  );

  const pairInfo =
    state.bidderPairShown || state.defenderPairShown
      ? `Pair shown: ${state.bidderPairShown ? "bidder" : "defender"} — bid adjusted.`
      : "";

  const callTrumpHint = canCallTrump
    ? `\nIMPORTANT: You cannot follow the led suit. You may either (1) discard any card, or (2) "callTrump" to reveal the trump suit (then you must play trump if you hold any). ${trickWinnerInfo} Points currently at stake in this trick: ${trickPoints}. Decide strategically: call trump to capture a trick your team is losing, or discard if your team already wins it.`
    : "";

  const tableBlock = table && table.length
    ? `SIMULATED OUTCOME TABLE (Monte-Carlo estimates for your legal moves):
${table.map((m) => `- ${m.label}: ${Math.round(m.pMakeContract * 100)}% to make the bid (expected ${m.expectedPoints.toFixed(1)} pts)`).join('\n')}

CRITICAL — trust the simulation. The table already applies the exact card ranking (J is HIGHEST, then 9, A, 10, K, Q, 8, 7 — note 9 does NOT beat J). A card beats another only if its rank is higher, or it is trump in Phase 2. Do not override the top move merely because you disagree about card strength; deviate only for a clear strategic reason (conserving a card, partner coordination).`
    : '';

  const user = `CURRENT GAME STATE:
Your hand: ${describeHand(state.hand)}
${trumpStatus}
${leadSuit}
Trick so far: ${trickCards || "(empty)"}
${trickWinnerInfo}
${partnerDutyHint}
Trick number: ${state.trickNumber || "?"} of 8
Bid: ${state.bid?.amount || "?"} by Player ${state.bid?.bidder || "?"}
Points your team has won this round: ${tricksWon}
Points at stake in current trick: ${trickPoints}
${pairInfo}
${callTrumpHint}

${buildCardMemory(state)}

${tableBlock}
Legal cards you can play: ${legalMoves.join(", ")}
${canCallTrump ? 'You may also "callTrump" instead of playing a card.' : ""}

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
  const map: Record<string, number> = { J: 3, "9": 2, A: 1, "10": 1 };
  return map[rank] ?? 0;
}

export function buildRebiddingPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const { maxRebid, points, note } = evaluateRebidHand(state.hand);

  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

REBID PHASE: You have now seen all 8 of your cards. You may raise the bid (to at least 24, or higher than the current bid if it is already 24+) if your hand is strong enough, or pass to keep the current bid.

CRITICAL — REBID DISCIPLINE:
- A bid of 24+ is a near-SOLO contract: your team must capture almost every one of the 28 points. It demands strength CONCENTRATED in 1–2 suits (a solid trump suit with J/9/A/10 and length), NOT points scattered across all four suits.
- HARD LIMIT: your 8-card hand supports a maximum rebid of ${maxRebid}. NEVER bid above ${maxRebid}.
- ${note}
- A balanced hand (points spread over 3–4 suits with no deep trump suit) has almost no chance of making 24 — PASS rather than raise.
- Only raise to 24+ when you hold a clear trump suit with high cards and length.`;

  const user = `CURRENT GAME STATE:
Your hand (8 cards): ${describeHand(state.hand)}
Current bid: ${state.bid?.amount} by Player ${state.bid?.bidder}
Minimum rebid: ${Math.max(24, (state.bid?.amount ?? 0) + 1)}
Hand strength: ${points} points — max rebid ${maxRebid}. Do not bid above ${maxRebid}. If the minimum required bid exceeds ${maxRebid}, pass.
You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your strategy",
  "action": "bid" | "pass",
  "bidAmount": number (only if action is "bid")
}`;

  return { system, user };
}

export function buildExplainPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
  chosen: { label: string; pMakeContract: number },
  table: MoveEvaluation[],
): { system: string; user: string } {
  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

Your move for this trick was ALREADY chosen by a Monte-Carlo simulation. Explain your reasoning in your own voice, in 1-2 sentences. Do not propose a different move.`;

  const rows = table
    .slice()
    .sort((a, b) => b.pMakeContract - a.pMakeContract)
    .map((m) => `- ${m.label}: ${Math.round(m.pMakeContract * 100)}% (expected ${m.expectedPoints.toFixed(1)} pts)`)
    .join('\n');

  const user = `Chosen move: ${chosen.label} (${Math.round(chosen.pMakeContract * 100)}% to make the bid)

Simulated outcomes for legal moves:
${rows}

Respond with JSON: { "reasoning": "..." }`;

  return { system, user };
}

export function buildTrumpSelectionPrompt(
  profile: AgentProfile,
  state: PlayerViewState,
): { system: string; user: string } {
  const changing = state.changingTrump;

  const system = `${buildGameRulesContext()}

You are ${profile.name}, with playing style: ${profile.strategyStyle}

${changing
  ? `TRUMP CHANGE: You raised the bid and may now change the trump suit. You can either keep the current trump (${state.trumpSuit}) or select a new trump card from your 8-card hand. Change it only if another suit is clearly stronger.`
  : `TRUMP SELECTION: You won the bidding. Choose which suit will be trump and which specific card you'll place face-down.
Pick a suit where you have strong cards (J, 9, A, 10) and ideally length (many cards of that suit).`}`;

  const user = `CURRENT GAME STATE:
Your hand: ${describeHand(state.hand)}
Your bid: ${state.bid?.amount}
${changing ? `Current trump suit: ${state.trumpSuit}` : ''}
You are Player ${state.playerIndex} (Team ${state.teamIndex}).

RESPOND with JSON:
{
  "reasoning": "Brief explanation of your trump choice",
  "action": ${changing ? '"selectTrump" | "keepTrump"' : '"selectTrump"'},
  "cardSuit": "hearts" | "diamonds" | "clubs" | "spades" (only for selectTrump),
  "cardRank": "J" | "9" | "A" | "10" | "K" | "Q" | "8" | "7" (only for selectTrump)
}`;

  return { system, user };
}
