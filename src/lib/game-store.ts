// Server-side game state store — simple in-memory Map
// In production, replace with Redis or database

import type { GameState, LegalMove, PlayerIndex, PlayerViewState } from '@/engine/types';
import { createGame, applyMove, getPlayerView, concedeGame, resolveRoundEarly, getRoundDecided } from '@/engine/game';
import { bestPlayDecision, evaluateMoves } from '@/engine/search';
import type { SearchResult, MoveEvaluation } from '@/engine/search';
import { getAgentProfile } from '@/agents/profiles';
import type { AgentProfile } from '@/agents/profiles';
import { getAgentDecision, getExplanation } from '@/agents/pipeline';
import { log } from '@/lib/log';
import { describeMove, withSpan } from '@/lib/tracing';

// Early-concede is enabled by default; set ALLOW_CONCEDE=false to disable.
const ALLOW_CONCEDE = process.env.ALLOW_CONCEDE !== 'false';
// Early round resolution is enabled by default; set ALLOW_EARLY_RESOLVE=false to disable.
const ALLOW_EARLY_RESOLVE = process.env.ALLOW_EARLY_RESOLVE !== 'false';
// Monte-Carlo card-play search mode: 'search' (default) uses the search for
// card play, 'llm' routes all decisions through the LLM, and 'hybrid' lets the
// LLM decide with a Monte-Carlo outcome table as guidance. AGENT_USE_SEARCH is
// kept as a legacy alias ('false' → 'llm').
const PLAY_MODE = (process.env.AGENT_PLAY_MODE || (process.env.AGENT_USE_SEARCH === 'false' ? 'llm' : 'search')) as 'search' | 'llm' | 'hybrid';
// When true, an LLM explains the search-chosen move (Table Talk) instead of
// showing the raw search reasoning.
const EXPLAIN = process.env.AGENT_EXPLAIN === 'true';
const SEARCH_SAMPLES = (() => {
  const n = parseInt(process.env.SEARCH_SAMPLES || '', 10);
  return Number.isNaN(n) || n <= 0 ? 150 : n;
})();

// In hybrid mode, restrict the LLM's card choices to the top-N moves by
// P(make contract). This prevents the LLM from overriding the search with a
// clearly-inferior card (e.g. misreading the J-highest ranking).
const HYBRID_TOP_N = (() => {
  const n = parseInt(process.env.HYBRID_TOP_N || '', 10);
  return Number.isNaN(n) || n <= 0 ? 3 : n;
})();

function legalMoveKey(m: LegalMove): string {
  switch (m.type) {
    case 'playCard':
    case 'selectTrump':
      return `${m.type}:${m.card.suit}:${m.card.rank}`;
    default:
      return m.type;
  }
}

/** Top-N moves by P(make contract). */
function topMoves(table: MoveEvaluation[], n: number): MoveEvaluation[] {
  return table.slice().sort((a, b) => b.pMakeContract - a.pMakeContract).slice(0, n);
}

function safeSearch(state: GameState, player: PlayerIndex): SearchResult | null {
  try { return bestPlayDecision(state, player, { samples: SEARCH_SAMPLES }); }
  catch (e) { log.warn('search failed, falling back to LLM:', (e as Error).message); return null; }
}
function safeEvaluate(state: GameState, player: PlayerIndex): MoveEvaluation[] {
  try { return evaluateMoves(state, player, { samples: SEARCH_SAMPLES }); }
  catch (e) { log.warn('evaluateMoves failed:', (e as Error).message); return []; }
}
async function explainSafely(profile: AgentProfile, view: PlayerViewState, result: SearchResult): Promise<string> {
  try {
    const chosen = result.moves.find((m) => m.move === result.move);
    return await getExplanation(profile, view, {
      label: chosen?.label ?? '',
      pMakeContract: result.pMakeContract,
    }, result.moves);
  } catch (e) {
    log.warn('explain failed, using search reasoning:', (e as Error).message);
    return result.reasoning;
  }
}

interface StoredGame {
  state: GameState;
  humanPlayer: PlayerIndex;
  agentIds: Record<number, string>; // player index → agent profile ID
  locked: boolean;                  // prevents concurrent mutation
}

const gameStore = new Map<string, StoredGame>();

// ─── Diagnostic logging ─────────────────────────────────────────────
// Monotonic sequence + structured fields to trace turn ordering and
// concurrent mutation. Grep the server log for `[thuruppu-seq]`.
let moveSequence = 0;

function emitMove(
  gameId: string,
  op: string,
  move: unknown,
  fields: Record<string, unknown>,
) {
  moveSequence += 1;
  log.info(
    '[thuruppu-seq] ' +
      JSON.stringify({
        seq: moveSequence,
        ts: new Date().toISOString(),
        game: gameId.slice(0, 8),
        op,
        move,
        ...fields,
      }),
  );
}

export function createNewGame(): { gameId: string; view: PlayerViewState } {
  const gameId = crypto.randomUUID();
  const state = createGame(0);
  const humanPlayer = 0 as PlayerIndex; // Human always plays as player 0 (South)

  const stored: StoredGame = {
    state,
    humanPlayer,
    agentIds: {
      1: 'opponent1', // East (Krishnan)
      2: 'partner',   // North (Raman)
      3: 'opponent2', // West (Kunjappu)
    },
    locked: false,
  };

  gameStore.set(gameId, stored);
  const view = getPlayerView(state, humanPlayer);

  return { gameId, view };
}

export function getGame(gameId: string): StoredGame | undefined {
  return gameStore.get(gameId);
}

export function getGameState(gameId: string): GameState | null {
  return gameStore.get(gameId)?.state ?? null;
}

export function getHumanView(gameId: string): PlayerViewState | null {
  const game = gameStore.get(gameId);
  if (!game) return null;
  const view = getPlayerView(game.state, game.humanPlayer);
  view.allowConcede = ALLOW_CONCEDE;
  return view;
}

/** Concede the match for a given player — returns updated view or error. */
export function processConcede(
  gameId: string,
  player: PlayerIndex,
): { view: PlayerViewState } | { error: string } {
  const game = gameStore.get(gameId);
  if (!game) return { error: 'Game not found' };
  if (!ALLOW_CONCEDE) return { error: 'Concede is disabled' };
  if (game.state.phase === 'finished') return { error: 'Game already finished' };

  game.state = concedeGame(game.state, player);
  const view = getPlayerView(game.state, game.humanPlayer);
  view.allowConcede = ALLOW_CONCEDE;
  return { view };
}

/** Resolve the round early when the outcome is mathematically decided. */
export function processResolveRound(
  gameId: string,
): { view: PlayerViewState } | { error: string } {
  const game = gameStore.get(gameId);
  if (!game) return { error: 'Game not found' };
  if (!ALLOW_EARLY_RESOLVE) return { error: 'Early resolution is disabled' };

  // Idempotent: if already resolved/scoring/finished, return current view.
  if (game.state.phase === 'scoring' || game.state.phase === 'finished') {
    const view = getPlayerView(game.state, game.humanPlayer);
    view.allowConcede = ALLOW_CONCEDE;
    return { view };
  }

  const info = getRoundDecided(game.state);
  if (!info.decided) return { error: 'Round is not decided yet' };

  game.state = resolveRoundEarly(game.state);
  const view = getPlayerView(game.state, game.humanPlayer);
  view.allowConcede = ALLOW_CONCEDE;
  return { view };
}

export function processHumanMove(
  gameId: string,
  move: Parameters<typeof applyMove>[1],
): { view: PlayerViewState; agentThinking: AgentAction[] } | { error: string } {
  const game = gameStore.get(gameId);
  if (!game) return { error: 'Game not found' };

  const before = game.state;
  emitMove(gameId, 'human', move, {
    beforePlayer: before.currentPlayer,
    beforePhase: before.phase,
    beforeTrickNumber: before.trickNumber,
    beforeTrickPlaced: before.currentTrick.cards.filter(c => c !== null).length,
    lockedAtMutation: game.locked,
  });

  try {
    game.state = applyMove(game.state, move);
    const view = getPlayerView(game.state, game.humanPlayer);
    emitMove(gameId, 'human-applied', move, {
      afterPlayer: game.state.currentPlayer,
      afterPhase: game.state.phase,
      afterTrickNumber: game.state.trickNumber,
    });
    return { view, agentThinking: [] };
  } catch (e) {
    emitMove(gameId, 'human-error', move, {
      beforePlayer: before.currentPlayer,
      beforePhase: before.phase,
      lockedAtMutation: game.locked,
      error: (e as Error).message,
    });
    return { error: 'Invalid move' };
  }
}

export interface AgentAction {
  player: PlayerIndex;
  agentName: string;
  move: ReturnType<typeof applyMove> extends GameState ? unknown : never;
  reasoning: string;
}

/** Process a single agent turn — used by polling endpoint for non-blocking updates */
export async function runSingleAgentTurn(gameId: string): Promise<AgentAction | null> {
  const game = gameStore.get(gameId);
  if (!game || game.locked) {
    if (game?.locked) {
      emitMove(gameId, 'agent-skipped-locked', null, {
        currentPlayer: game.state.currentPlayer,
        phase: game.state.phase,
        humanPlayer: game.humanPlayer,
      });
    }
    return null;
  }
  if (game.state.currentPlayer === game.humanPlayer) return null;
  if (game.state.phase === 'finished' || game.state.phase === 'scoring') return null;

  const player = game.state.currentPlayer;
  const agentId = game.agentIds[player];
  if (!agentId) return null;

  const before = game.state;
  emitMove(gameId, 'agent-turn', null, {
    player,
    agentId,
    beforePlayer: before.currentPlayer,
    beforePhase: before.phase,
    beforeTrickNumber: before.trickNumber,
    beforeTrickPlaced: before.currentTrick.cards.filter(c => c !== null).length,
  });

  game.locked = true;
  try {
    const profile = getAgentProfile(agentId);
    const phase = game.state.phase;

    return await withSpan(
      'agent.turn',
      {
        'game.id': gameId.slice(0, 8),
        'game.player': player,
        'game.phase': phase,
        'game.trick_number': game.state.trickNumber,
        'agent.profile_id': agentId,
        'agent.name': profile.name,
      },
      async (span) => {
        // Card play can be decided by Monte-Carlo search, the LLM, or a hybrid of
        // both (LLM decides with a search outcome table as guidance), per PLAY_MODE.
        // The LLM still handles bidding, trump selection, and the rebid.
        let move;
        let reasoning;

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
          const view = getPlayerView(game.state, player);
          // Restrict the LLM to the top-N search moves so it can't override with a
          // clearly-inferior card. Non-card moves (e.g. showPair) stay legal.
          const top = topMoves(table, HYBRID_TOP_N);
          if (top.length > 0 && top.length < table.length) {
            const allowed = new Set(top.map((m) => legalMoveKey(m.move)));
            view.legalMoves = view.legalMoves.filter((m) =>
              m.type === 'playCard' || m.type === 'callTrump'
                ? allowed.has(legalMoveKey(m))
                : true,
            );
          }
          ({ move, reasoning } = await getAgentDecision(profile, view, top));
        } else {
          ({ move, reasoning } = await getAgentDecision(profile, getPlayerView(game.state, player)));
        }

        span.setAttribute('agent.move', describeMove(move));
        game.state = applyMove(game.state, move);
        game.locked = false;

        emitMove(gameId, 'agent-applied', move, {
          player,
          afterPlayer: game.state.currentPlayer,
          afterPhase: game.state.phase,
          afterTrickNumber: game.state.trickNumber,
        });

        return {
          player,
          agentName: profile.name,
          move,
          reasoning,
        };
      }
    );
  } catch (e) {
    game.locked = false;
    emitMove(gameId, 'agent-error', null, {
      player,
      agentId,
      error: (e as Error).message,
    });
    throw e;
  }
}

export async function runAgentTurns(gameId: string): Promise<{
  view: PlayerViewState;
  agentActions: AgentAction[];
}> {
  const game = gameStore.get(gameId);
  if (!game) throw new Error('Game not found');

  // Prevent concurrent agent processing
  if (game.locked) {
    // Already running agents — return current view
    return {
      view: getPlayerView(game.state, game.humanPlayer),
      agentActions: [],
    };
  }

  game.locked = true;
  const agentActions: AgentAction[] = [];

  // Loop until it's the human's turn or game ends
  while (
    game.state.currentPlayer !== game.humanPlayer &&
    game.state.phase !== 'finished'
  ) {
    const player = game.state.currentPlayer;
    const agentId = game.agentIds[player];
    if (!agentId) break; // No agent for this player

    const profile = getAgentProfile(agentId);
    const playerView = getPlayerView(game.state, player);

    const { move, reasoning } = await getAgentDecision(profile, playerView);
    game.state = applyMove(game.state, move);

    agentActions.push({
      player,
      agentName: profile.name,
      move,
      reasoning,
    });

    // Safety: prevent infinite loops
    if (agentActions.length > 50) break;
  }

  game.locked = false;
  const view = getPlayerView(game.state, game.humanPlayer);
  return { view, agentActions };
}
