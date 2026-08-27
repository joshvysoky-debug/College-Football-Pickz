import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { MAX_PLAYOFF_PICKS, getPlayoffPicksLockTime } from '@/lib/playoffConfig';

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const body = await request.json();
  const teamId = Number(body.teamId);

  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }

  const { season } = currentSeasonAndWeek();

  // RLS also enforces the kickoff lock; this just gives a clean error message.
  const lockTime = await getPlayoffPicksLockTime(supabase, season);
  if (lockTime && new Date() >= lockTime) {
    return NextResponse.json({ error: 'playoff picks are locked' }, { status: 403 });
  }

  // Only FBS teams are eligible.
  const { data: team } = await supabase
    .from('teams')
    .select('id, classification')
    .eq('id', teamId)
    .single();

  if (!team) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }
  if (team.classification !== 'fbs') {
    return NextResponse.json(
      { error: 'only FBS teams are eligible for playoff picks' },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from('playoff_picks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('season', season);

  if ((count ?? 0) >= MAX_PLAYOFF_PICKS) {
    return NextResponse.json(
      { error: `You can only pick ${MAX_PLAYOFF_PICKS} teams` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('playoff_picks')
    .insert({ user_id: user.id, team_id: teamId, season });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = Number(searchParams.get('teamId'));

  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }

  const { season } = currentSeasonAndWeek();

  // RLS also enforces the kickoff lock; this just gives a clean error message.
  const lockTime = await getPlayoffPicksLockTime(supabase, season);
  if (lockTime && new Date() >= lockTime) {
    return NextResponse.json({ error: 'playoff picks are locked' }, { status: 403 });
  }

  const { error } = await supabase
    .from('playoff_picks')
    .delete()
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .eq('season', season);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
