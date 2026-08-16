# Contract-Aware Monte Carlo Search + LLM Integration

Date: 2026-08-16
Status: Design validated (pending implementation)

## Problem

The Monte Carlo search (`src/engine/search.ts`) has three weaknesses:

1. **Wrong objective.** It scores moves by *expected team card points*, but the actual
   win condition is *making the bid contract* (`state.bid.amount`). Maximizing points
   is not the same as maximizing the probability of reaching the bid — e.g. a player
   may waste trump on an early low-value trick because it wins a couple of points,
   when saving trump would better serve the contract.
2. **Self-play bias.** All four players share one greedy policy, so "opponents"
   effectively cooperate with the deciding player's objective rather than defending.
   This overstates our team's win probability.
3. **No LLM visibility.** The per-move evaluation is computed internally and discarded;
   only the argmax move survives. The LLM never sees it.

## Goals

1. Score moves by **P(make the contract)** while still reporting expected points.
2. Make the playout **contract-aware and team-aware** to reduce self-play bias and
   fix the "burn trump early" behavior.
3. **Expose the per-move evaluation table.**
4. Add two LLM integration modes behind flags:
   - **A — search decides, LLM explains** (richer Table Talk).
   - **B — LLM decides, search advises** (opt-in hybrid).

## Design

### Section 1 — Objective: P(make the contract)

`src/engine/search.ts`:

- New helper `roundWin(state, playerIndex): 0 | 1`. Mirrors `getRoundDecided`
  math but works on terminal states:
  - `bidderTeam = getTeam(state.bid.bidder)`
  - `madeBid = biddingTeamPoints >= state.bid.amount`
  - returns `1` if `getTeam(playerIndex) === bidderTeam ? madeBid : !madeBid`, else `0`.
  - No extra pair adjustment needed — `handleShowPair` already mutates `bid.amount` ±4.
- `playout` returns `roundWin` (0/1) instead of `teamPoints`.
- `evaluateMove` averages the 0/1 over `samples` → `P(make contract)` ∈ [0,1].
- `bestPlayDecision` picks `argmax P`. `reasoning` becomes e.g.
  `"Search (150 samples) → play A♠ (63% to make the 20-bid)"`.
- **Also report expected points** in the result (for logging/debug), even though P drives selection.
- Defensive fallback: if no bid present (shouldn't happen in play phases), revert to expected-points scoring.

### Section 2 — Contract-aware playout

- `greedyPlay` scores each card choice by *that player's own team's* `roundWin`,
  not raw trick points. This is the **teamAware** opponent policy — opponents defend
  the contract instead of handing us points.
- The `callTrump` decision changes from `pointsAtStake > 0` to contract-driven:
  call only when the trick's points materially affect whether the team makes/breaks the bid.
- Opponent policy is a tunable enum `'greedy' | 'teamAware' | 'maxmin'`, default `teamAware`.
  - `maxmin` (opponents explicitly minimize our P) is **deferred** — it needs a
    mini-search inside the playout and is the tractable step toward Nash (see below).

### Section 3 — Expose table + LLM integration

**3a. Expose per-move evaluations.**
- Add `evaluateMoves(state, playerIndex, options) → MoveEvaluation[]`,
  entries `{ move, pMakeContract, expectedPoints, label }`.
- `bestPlayDecision` becomes a thin wrapper: run `evaluateMoves`, take `argmax pMakeContract`.
- `SearchResult` carries the full table + the chosen move's `expectedPoints`.

**3b. Variant A — search decides, LLM explains.**
- New `buildExplainPrompt(profile, state, chosenMove, table)`:
  - `system` = rules + persona ("You are Raman…").
  - `user` = chosen move + table + current state (hand, trump, trick, bid).
  - LLM returns a 1–2 sentence strategy note in the persona's voice.
- Replaces the sterile `"Search (150 samples) → …"` in the Table Talk panel.
- **Synchronous**, gated by `AGENT_EXPLAIN` (default **off**), so default latency
  is unchanged.

**3c. Variant B — LLM decides, search advises (behind a flag).**
- New `AGENT_PLAY_MODE=search|llm|hybrid`:
  - `search` (default) — today's `AGENT_USE_SEARCH=true`.
  - `llm` — today's `AGENT_USE_SEARCH=false`.
  - `hybrid` — search computes the table; `buildPlayPrompt` gains a
    `SIMULATED OUTCOME TABLE` block (per legal move: P + expected points);
    LLM makes the final call (still constrained to legal moves via `parseDecision`).
- `AGENT_USE_SEARCH` kept as a backward-compatible alias for `search`/`llm`.

## On Nash equilibrium (considered, out of scope)

Exact Nash is intractable for 28 (imperfect information → CFR + abstraction, the
Libratus/Pluribus class of solver). The valid kernel of the idea is addressed by
the **teamAware** (now) and **maxmin** (future) opponent policies — cheap moves
toward adversarial play without a full solver.

## Files touched

| File | Change |
|------|--------|
| `src/engine/search.ts` | `roundWin`, objective change, `evaluateMoves`, teamAware playout, callTrump heuristic |
| `src/agents/prompts.ts` | `buildExplainPrompt`, `SIMULATED OUTCOME TABLE` block |
| `src/agents/pipeline.ts` | explain path, hybrid-mode decision flow |
| `src/lib/game-store.ts` | `AGENT_PLAY_MODE` / `AGENT_EXPLAIN` flags, explain wiring |
| `src/engine/__tests__/search.test.ts` | objective + table + teamAware tests |

## Decision log

- Metric: P(make contract) drives selection; expected points also reported.
- Playout: contract-aware + `teamAware` (default); `maxmin` deferred.
- Explain (variant A): synchronous, gated by `AGENT_EXPLAIN` (default off).
- Mode flag (variant B): `AGENT_PLAY_MODE=search|llm|hybrid`; `AGENT_USE_SEARCH` alias.
- Nash: exact out of scope; teamAware/maxmin are the tractable steps toward it.
