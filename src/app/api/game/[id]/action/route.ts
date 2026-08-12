// POST /api/game/[id]/action — human player submits a move
import { NextResponse } from 'next/server';
import { processHumanMove, runSingleAgentTurn, getHumanView } from '@/lib/game-store';
import type { LegalMove } from '@/engine/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const move = body.move as LegalMove;

  if (!move) {
    return NextResponse.json({ error: 'Missing move' }, { status: 400 });
  }

  // Process human move
  const result = processHumanMove(id, move);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Process only ONE agent turn so the human sees intermediate state.
  // The frontend will poll /state for remaining agent turns.
  // Exception: during play phase, process all agents so card plays appear together.
  const view = getHumanView(id);
  let agentAction = null;

  if (view && view.phase !== 'bidding') {
    // Play phase — process one agent turn at a time too for better pacing
    agentAction = await runSingleAgentTurn(id);
  }
  // During bidding, don't process agents — let the state poll handle it

  const updatedView = getHumanView(id);

  return NextResponse.json({
    view: updatedView,
    agentActions: agentAction ? [{
      player: agentAction.player,
      name: agentAction.agentName,
      move: agentAction.move,
      reasoning: agentAction.reasoning,
    }] : [],
  });
}
