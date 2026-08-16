# Contract-Aware Monte Carlo Search — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the Monte-Carlo search from "maximize expected card points" to "maximize probability of making the bid contract," expose the per-move evaluation table, and add two LLM integration modes (search-decides/LLM-explains, and LLM-decides/search-advises).

**Architecture:** The engine (`src/engine/search.ts`) gets a `roundWin` objective + `evaluateMoves` table API and a contract-aware playout. The agent layer (`src/agents/`) gets an explain prompt and a hybrid play prompt. `src/lib/game-store.ts` wires it via `AGENT_PLAY_MODE` / `AGENT_EXPLAIN` flags.

**Tech Stack:** TypeScript, Vitest, Next.js. Pure engine logic, no external deps.

**Design doc:** `docs/plans/2026-08-16-contract-aware-search-design.md` (committed on main).

---

## Task 1: `roundWin` objective helper

**Files:**
- Modify: `src/engine/search.ts`
- Test: `src/engine/__tests__/search.test.ts`

**Step 1: Write the failing test**

Add to `search.test.ts`. Import `roundWin` alongside `bestPlayDecision, mulberry32`:

```ts
import { bestPlayDecision, roundWin, mulberry32 } from '../search';
```

Add this test inside the `describe('Monte Carlo search', ...)` block:

```ts
it('roundWin scores contract success from the deciding player perspective', () => {
  // Bidding team is players 0/2. Completed tricks give them 18 pts total.
  const tricks = [
    { cards: [], winner: 0 as PlayerIndex, points: 10 },
    { cards: [], winner: 2 as PlayerIndex, points: 8 },
  ];

  // Bid 20 → 18 < 20, bidding team loses.
  const fail = makePlayState({ bid: { amount: 20, bidder: 0 as PlayerIndex }, tricks });
  expect(roundWin(fail, 0)).toBe(0); // bidder's own seat loses
  expect(roundWin(fail, 1)).toBe(1); // defender wins
  expect(roundWin(fail, 3)).toBe(1);

  // Bid 16 → 18 >= 16, bidding team makes it.
  const win = makePlayState({ bid: { amount: 16, bidder: 0 as PlayerIndex }, tricks });
  expect(roundWin(win, 0)).toBe(1);
  expect(roundWin(win, 2)).toBe(1); // partner also wins
  expect(roundWin(win, 1)).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/__tests__/search.test.ts`
Expected: FAIL — `roundWin` is not exported.

**Step 3: Write the implementation**

Add `roundWin` to `search.ts` (near `teamPoints`):

```ts
/** 1 if `playerIndex`'s team wins the round (makes/breaks the contract), else 0. */
export function roundWin(state: GameState, playerIndex: PlayerIndex): 0 | 1 {
  const bid = state.bid;
  if (!bid) return 0; // no contract → defensive 0
  const bidderTeam = getTeam(bid.bidder);
  let biddingTeamPoints = 0;
  for (const t of state.tricks) {
    if (getTeam(t.winner) === bidderTeam) biddingTeamPoints += t.points;
  }
  const madeBid = biddingTeamPoints >= bid.amount;
  const myTeam = getTeam(playerIndex);
  return (myTeam === bidderTeam ? madeBid : !madeBid) ? 1 : 0;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/engine/__tests__/search.test.ts`
Expected: PASS (5 tests now).

**Step 5: Commit**

```bash
git add src/engine/search.ts src/engine/__tests__/search.test.ts
git commit -m "feat(search): add roundWin contract objective helper"
```

---

## Task 2: `playout` returns `{ win, points }`; `evaluateMove` returns P + points

**Files:**
- Modify: `src/engine/search.ts`
- Test: `src/engine/__tests__/search.test.ts`

**Step 1: Write the failing test**

Add:

```ts
it('bestPlayDecision reports pMakeContract in [0,1] and expectedPoints', () => {
  const state = makePlayState({
    hands: [
      [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }, { suit: 'clubs', rank: '9' }],
      [{ suit: 'diamonds', rank: 'A' }],
      [{ suit: 'hearts', rank: 'A' }],
      [{ suit: 'clubs', rank: 'K' }],
    ],
    currentTrick: { cards: [null, null, null, null], leadSuit: null },
  });
  const r = bestPlayDecision(state, 0, { samples: 30, rng: mulberry32(99) });
  expect(r).not.toBeNull();
  expect(r!.pMakeContract).toBeGreaterThanOrEqual(0);
  expect(r!.pMakeContract).toBeLessThanOrEqual(1);
  expect(r!.expectedPoints).toBeGreaterThanOrEqual(0);
});
```

**Step 2: Run test — fails** (no `pMakeContract` property).

**Step 3: Write the implementation**

Change `playout` to return both signals:

```ts
interface PlayoutResult { win: 0 | 1; points: number; }

function playout(state: GameState, playerIndex: PlayerIndex): PlayoutResult {
  let s = cloneState(state);
  let guard = 0;
  while ((s.phase === 'firstPhase' || s.phase === 'secondPhase') && guard < 200) {
    // ... existing body unchanged ...
  }
  return { win: roundWin(s, playerIndex), points: teamPoints(s, playerIndex) };
}
```

Change `evaluateMove` to return a `MoveEvaluation`:

```ts
function evaluateMove(
  state: GameState, playerIndex: PlayerIndex, move: LegalMove,
  samples: number, rng: () => number,
): { pMakeContract: number; expectedPoints: number } {
  let winTotal = 0, ptsTotal = 0;
  for (let i = 0; i < samples; i++) {
    const deal = sampleDeal(state, playerIndex, rng);
    const next = applyMove(deal, move);
    const r = playout(next, playerIndex);
    winTotal += r.win;
    ptsTotal += r.points;
  }
  return { pMakeContract: winTotal / samples, expectedPoints: ptsTotal / samples };
}
```

Update `bestPlayDecision` to consume `{ pMakeContract, expectedPoints }` (see Task 4 for the full refactor; for now just replace the `score` variable with `score.pMakeContract` and read `score.expectedPoints` for the result). Keep `expectedPoints` in the returned object so the existing determinism test still passes.

**Step 4: Run test — passes** (all existing + new tests green).

**Step 5: Commit**

```bash
git add src/engine/search.ts src/engine/__tests__/search.test.ts
git commit -m "feat(search): score playout by P(make contract) with expected points"
```

---

## Task 3: Contract-aware playout (callTrump materiality)

**Files:**
- Modify: `src/engine/search.ts`
- Test: `src/engine/__tests__/search.test.ts`

**Step 1: Write the failing test**

Export and test a `shouldCallTrump` helper:

```ts
import { bestPlayDecision, shouldCallTrump, mulberry32 } from '../search';
```

```ts
it('shouldCallTrump is contract-aware: skips low-value early tricks, calls when material', () => {
  // Void in hearts, hold trump J; opponent led a 1-pt heart. < 2 pts → skip.
  const low = makePlayState({
    hands: [
      [{ suit: 'spades', rank: 'J' }, { suit: 'diamonds', rank: '7' }],
      [{ suit: 'hearts', rank: 'A' }], [{ suit: 'hearts', rank: '7' }], [{ suit: 'clubs', rank: '7' }],
    ],
    currentPlayer: 0 as PlayerIndex,
    currentTrick: { cards: [null, { card: { suit: 'hearts', rank: 'A' }, player: 1 }, null, null], leadSuit: 'hearts' },
    trumpSuit: 'spades', trumpRevealed: false,
  });
  expect(shouldCallTrump(low, 0)).toBe(false);

  // Opponent led a J (3 pts) → material → call.
  const high = makePlayState({
    ...low, // spread requires full object; see note below
    currentTrick: { cards: [null, { card: { suit: 'hearts', rank: 'J' }, player: 1 }, null, null], leadSuit: 'hearts' },
  });
  expect(shouldCallTrump(high, 0)).toBe(true);
});
```

> Note: `makePlayState` takes a partial `GameState`; construct `high` by repeating the full `hands`/`currentPlayer`/`trumpSuit`/`trumpRevealed` fields rather than spreading `low` (which is a `GameState`, not a partial). The test author should build both states explicitly.

**Step 2: Run test — fails** (no `shouldCallTrump` export).

**Step 3: Write the implementation**

Add to `search.ts`:

```ts
/** Whether the current player should reveal trump during the playout.
 *  Contract-aware: only when the trick's points are material (>= 2) and our
 *  team is not already winning it. Fixes the "burn trump early" behavior. */
export function shouldCallTrump(state: GameState, player: PlayerIndex): boolean {
  const placed = state.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
  const pointsAtStake = placed.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
  if (pointsAtStake < 2) return false;
  const winner = currentTrickWinner(state);
  if (winner && getTeam(winner.player) === getTeam(player)) return false;
  return true;
}
```

Replace the `callTrump` branch in `playout` — currently:

```ts
const placed = s.currentTrick.cards.filter((c) => c !== null) as TrickCard[];
const pointsAtStake = placed.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
if (pointsAtStake > 0) { chosen = callTrump; } else { chosen = greedyPlay(s, s.currentPlayer); }
```

with:

```ts
if (callTrump && s.currentTrick.leadSuit !== null) {
  chosen = shouldCallTrump(s, s.currentPlayer) ? callTrump : greedyPlay(s, s.currentPlayer);
}
```

> **Deferred (teamAware opponent policy):** making the greedy lead/follow truly
> team-aware (each opponent optimizing its own team's contract) requires
> lookahead to be correct — a naive rule leads high cards into unknown voids and
> wastes points. This is the `maxmin` direction, tracked as follow-up. The
> `shouldCallTrump` fix above is the concrete contract-aware change for this iteration.

**Step 4: Run the full test suite**

Run: `npm test`
Expected: all 57+ tests pass. If the existing "cuts an opponent trick with trump J" test fails, re-examine: that test uses a 3-pt `J` in a fully-revealed `secondPhase`, so `shouldCallTrump` is not involved (that path is the *decision* candidates, not playout internals) — it should still pass.

**Step 5: Commit**

```bash
git add src/engine/search.ts src/engine/__tests__/search.test.ts
git commit -m "feat(search): contract-aware playout (callTrump materiality)"
```

---

## Task 4: `evaluateMoves` table + `SearchResult` full API

**Files:**
- Modify: `src/engine/search.ts`
- Test: `src/engine/__tests__/search.test.ts`

**Step 1: Write the failing test**

```ts
it('evaluateMoves returns one entry per candidate with a label', () => {
  const state = makePlayState({
    hands: [
      [{ suit: 'spades', rank: 'J' }, { suit: 'hearts', rank: '7' }],
      [], [], [],
    ],
    currentTrick: { cards: [null, null, null, null], leadSuit: null },
  });
  const moves = evaluateMoves(state, 0, { samples: 10, rng: mulberry32(42) });
  expect(moves.length).toBeGreaterThan(0);
  for (const m of moves) {
    expect(m.pMakeContract).toBeGreaterThanOrEqual(0);
    expect(m.pMakeContract).toBeLessThanOrEqual(1);
    expect(typeof m.label).toBe('string');
    expect(m.label.length).toBeGreaterThan(0);
  }
});
```

Import `evaluateMoves`.

**Step 2: Run test — fails** (no export).

**Step 3: Write the implementation**

Define and export the types + `evaluateMoves`:

```ts
export interface MoveEvaluation {
  move: LegalMove;
  pMakeContract: number;   // 0..1
  expectedPoints: number;  // my team's expected card points
  label: string;
}

export interface SearchResult {
  move: LegalMove;
  expectedPoints: number;
  pMakeContract: number;
  reasoning: string;
  moves: MoveEvaluation[];
}

function moveLabel(move: LegalMove): string {
  if (move.type === 'callTrump') return 'call trump';
  if (move.type === 'playCard') return `play ${formatCard(move.card)}`;
  return String(move.type);
}

export function evaluateMoves(
  state: GameState, playerIndex: PlayerIndex, options: SearchOptions = {},
): MoveEvaluation[] {
  const samples = options.samples ?? 150;
  const rng = options.rng ?? Math.random;
  const candidates = getLegalMoves(state).filter(
    (m) => m.type === 'playCard' || m.type === 'callTrump',
  );
  return candidates.map((move) => {
    const { pMakeContract, expectedPoints } = evaluateMove(state, playerIndex, move, samples, rng);
    return { move, pMakeContract, expectedPoints, label: moveLabel(move) };
  });
}
```

Import `formatCard` from `./cards`.

Rewrite `bestPlayDecision` as a thin wrapper:

```ts
export function bestPlayDecision(
  state: GameState, playerIndex: PlayerIndex, options: SearchOptions = {},
): SearchResult | null {
  if (state.phase !== 'firstPhase' && state.phase !== 'secondPhase') return null;
  const moves = evaluateMoves(state, playerIndex, options);
  if (moves.length === 0) return null;
  const best = moves.reduce((a, b) => (b.pMakeContract > a.pMakeContract ? b : a));
  const pct = Math.round(best.pMakeContract * 100);
  const bidAmt = state.bid?.amount ?? '?';
  return {
    move: best.move,
    expectedPoints: best.expectedPoints,
    pMakeContract: best.pMakeContract,
    reasoning: `Search (${options.samples ?? 150} samples) → ${best.label} (${pct}% to make the ${bidAmt}-bid)`,
    moves,
  };
}
```

**Step 4: Run tests — all pass.** Ensure the determinism test (compares `.move` and `.expectedPoints`) still passes, and the trump-cut test still passes.

**Step 5: Commit**

```bash
git add src/engine/search.ts src/engine/__tests__/search.test.ts
git commit -m "feat(search): expose evaluateMoves table and full SearchResult"
```

---

## Task 5: Variant A — `buildExplainPrompt` + `getExplanation`

**Files:**
- Modify: `src/agents/prompts.ts`
- Modify: `src/agents/pipeline.ts`
- Test: `src/engine/__tests__/search.test.ts` (no change; this is LLM-layer, covered by typecheck)

**Step 1: Write the code (no runtime unit test — LLM layer; verify via typecheck/build)**

In `prompts.ts`, add an import of the `MoveEvaluation` type and a new builder:

```ts
import type { MoveEvaluation } from '@/engine/search';

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
```

In `pipeline.ts`, add:

```ts
import { buildExplainPrompt } from './prompts';
import type { MoveEvaluation } from '@/engine/search';

export async function getExplanation(
  profile: AgentProfile,
  state: PlayerViewState,
  chosen: { label: string; pMakeContract: number },
  table: MoveEvaluation[],
): Promise<string> {
  const { system, user } = buildExplainPrompt(profile, state, chosen, table);
  const response = await callLLM(profile.provider, profile.model, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], profile.temperature, { type: 'json_object' });
  const cleaned = stripMarkdownFences(response);
  try {
    const parsed = JSON.parse(cleaned) as { reasoning?: string };
    if (parsed.reasoning) return parsed.reasoning;
  } catch { /* fall through */ }
  return chosen.label;
}
```

**Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

**Step 3: Commit**

```bash
git add src/agents/prompts.ts src/agents/pipeline.ts
git commit -m "feat(agents): add buildExplainPrompt and getExplanation (variant A)"
```

---

## Task 6: Variant B — hybrid play prompt + mode flags

**Files:**
- Modify: `src/agents/prompts.ts` (add table block to `buildPlayPrompt`)
- Modify: `src/agents/pipeline.ts` (accept optional table)
- Modify: `src/lib/game-store.ts` (mode flags + wiring)

**Step 1: Add optional table to `buildPlayPrompt`**

Change signature to `buildPlayPrompt(profile, state, table?: MoveEvaluation[])` and, just before the `RESPOND with JSON` block in the user string, insert:

```ts
const tableBlock = table && table.length
  ? `SIMULATED OUTCOME TABLE (Monte-Carlo estimates for your legal moves):
${table.map((m) => `- ${m.label}: ${Math.round(m.pMakeContract * 100)}% to make the bid (expected ${m.expectedPoints.toFixed(1)} pts)`).join('\n')}

Use these as guidance. You may deviate if you see a strategic reason.`
  : '';

const user = `CURRENT GAME STATE:
...
${tableBlock}

Legal cards you can play: ${legalMoves.join(", ")}
...
`;
```

**Step 2: Thread `table` through `getAgentDecision`**

In `pipeline.ts`, add an optional param:

```ts
export async function getAgentDecision(
  profile: AgentProfile,
  state: PlayerViewState,
  table?: MoveEvaluation[],
): Promise<{ move: LegalMove; reasoning: string }> {
```

Pass `table` to `buildPlayPrompt(profile, state, table)` in the play branch.

**Step 3: Wire flags in `game-store.ts`**

Replace the `USE_SEARCH` block with:

```ts
const PLAY_MODE = (process.env.AGENT_PLAY_MODE || (process.env.AGENT_USE_SEARCH === 'false' ? 'llm' : 'search')) as 'search' | 'llm' | 'hybrid';
const EXPLAIN = process.env.AGENT_EXPLAIN === 'true';
const SEARCH_SAMPLES = (() => {
  const n = parseInt(process.env.SEARCH_SAMPLES || '', 10);
  return Number.isNaN(n) || n <= 0 ? 150 : n;
})();
```

Replace the play-phase branch in `runSingleAgentTurn`:

```ts
let move; let reasoning;
const phase = game.state.phase;
const isPlayPhase = phase === 'firstPhase' || phase === 'secondPhase';

if (isPlayPhase && PLAY_MODE === 'search') {
  const result = safeSearch(game.state, player);
  if (result) {
    move = result.move;
    reasoning = EXPLAIN
      ? await explainSafely(profile, getPlayerView(game.state, player), result)
      : result.reasoning;
  } else {
    ({ move, reasoning } = await getAgentDecision(profile, getPlayerView(game.state, player)));
  }
} else if (isPlayPhase && PLAY_MODE === 'hybrid') {
  const table = safeEvaluate(game.state, player);
  ({ move, reasoning } = await getAgentDecision(profile, getPlayerView(game.state, player), table));
} else {
  ({ move, reasoning } = await getAgentDecision(profile, getPlayerView(game.state, player)));
}
```

Add two safe wrappers (import `bestPlayDecision`, `evaluateMoves`):

```ts
function safeSearch(state: GameState, player: PlayerIndex): SearchResult | null {
  try { return bestPlayDecision(state, player, { samples: SEARCH_SAMPLES }); }
  catch (e) { console.warn('search failed, falling back to LLM:', (e as Error).message); return null; }
}
function safeEvaluate(state: GameState, player: PlayerIndex): MoveEvaluation[] {
  try { return evaluateMoves(state, player, { samples: SEARCH_SAMPLES }); }
  catch (e) { console.warn('evaluateMoves failed:', (e as Error).message); return []; }
}
async function explainSafely(profile: AgentProfile, view: PlayerViewState, result: SearchResult): Promise<string> {
  try { return await getExplanation(profile, view, { label: result.moves.find(m => m.move === result.move)?.label ?? '', pMakeContract: result.pMakeContract }, result.moves); }
  catch (e) { console.warn('explain failed, using search reasoning:', (e as Error).message); return result.reasoning; }
}
```

Add imports for `GameState`, `PlayerIndex`, `SearchResult`, `MoveEvaluation`, `evaluateMoves`, `getExplanation`, `AgentProfile`.

**Step 4: Verify typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

**Step 5: Commit**

```bash
git add src/agents/prompts.ts src/agents/pipeline.ts src/lib/game-store.ts
git commit -m "feat: hybrid play mode + explain flag (AGENT_PLAY_MODE, AGENT_EXPLAIN)"
```

---

## Task 7: Update README env docs

**Files:**
- Modify: `README.md` (the env block near line 233)

**Step 1: Replace the env snippet**

```env
# AGENT_PLAY_MODE=search   # search (default) | hybrid (LLM decides w/ search table) | llm
# AGENT_USE_SEARCH=false   # legacy alias for AGENT_PLAY_MODE=llm
# SEARCH_SAMPLES=150       # hidden-deal samples per move (higher = stronger, slower)
# AGENT_EXPLAIN=true       # LLM explains search-chosen moves (Table Talk); off by default
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document AGENT_PLAY_MODE / AGENT_EXPLAIN"
```

---

## Final Verification

Run the full suite + build:

```bash
npm test
npx tsc --noEmit
```

Expected: all 57+ tests pass, zero type errors. Manual smoke test (optional): `npm run dev`, start a game, confirm Table Talk shows the new `"…% to make the N-bid"` reasoning when `AGENT_EXPLAIN=true`.
