// GET /api/game/[id]/state — get current game state for human player
import { NextResponse } from 'next/server';
import { getHumanView, getGame, runSingleAgentTurn } from '@/lib/game-store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // If it's an agent's turn, process ONE agent action.
  // Return the agent action so the frontend can animate card plays.
  let agentAction = null;
  const game = getGame(id);
  if (
    game &&
    !game.locked &&
    game.state.currentPlayer !== game.humanPlayer &&
    game.state.phase !== 'finished'
  ) {
    try {
      agentAction = await runSingleAgentTurn(id);
    } catch (e) {
      console.error('Agent turn failed:', (e as Error).message);
    }
  }

  const view = getHumanView(id);

  if (!view) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  return NextResponse.json({
    view,
    agentAction: agentAction ? {
      player: agentAction.player,
      name: agentAction.agentName,
      move: agentAction.move,
      reasoning: agentAction.reasoning,
    } : null,
  });
}
