import { redirect } from 'next/navigation';
import { currentSeasonAndWeek } from '@/lib/cfbd';
import { getDisplayWeek } from '@/lib/currentWeek';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const { season } = currentSeasonAndWeek();
  const supabase = createClient();
  const week = await getDisplayWeek(supabase, season);
  redirect(`/picks/${week}`);
}
