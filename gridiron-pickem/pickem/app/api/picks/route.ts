import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const body = await request.json();
  const gameId = Number(body.gameId);
  const pickedTeamId = Number(body.pickedTeamId);

  if (!gameId || !pickedTeamId) {
    return NextResponse.json({ error: 'gameId and pickedTeamId are required' }, { status: 400 });
  }

  // RLS also enforces the kickoff lock; this just gives a clean error message.
  const { data: game } = await supabase
    .from('games')
    .select('start_date')
    .eq('id', gameId)
    .single();

  if (!game) {
    return NextResponse.json({ error: 'game not found' }, { status: 404 });
  }
  if (new Date(game.start_date) <= new Date()) {
    return NextResponse.json({ error: 'picks are locked for this game' }, { status: 403 });
  }

  const { error } = await supabase
    .from('picks')
    .upsert(
      { user_id: user.id, game_id: gameId, picked_team_id: pickedTeamId },
      { onConflict: 'user_id,game_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
