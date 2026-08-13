// POST /api/game/[id]/resolve — resolve the round early (outcome already decided)
import { NextResponse } from 'next/server';
import { processResolveRound } from '@/lib/game-store';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = processResolveRound(id);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ view: result.view });
}
