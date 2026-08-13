// POST /api/game/[id]/concede — human concedes the match early
import { NextResponse } from 'next/server';
import { processConcede } from '@/lib/game-store';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = processConcede(id, 0); // human is always player 0

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ view: result.view });
}
