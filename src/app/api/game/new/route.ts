// POST /api/game/new — create a new game
import { NextResponse } from 'next/server';
import { createNewGame } from '@/lib/game-store';

export async function POST() {
  const { gameId, view } = createNewGame();
  return NextResponse.json({ gameId, view });
}
