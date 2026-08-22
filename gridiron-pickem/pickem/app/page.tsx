import { redirect } from 'next/navigation';
import { currentSeasonAndWeek } from '@/lib/cfbd';

export default function HomePage() {
  const { week } = currentSeasonAndWeek();
  redirect(`/picks/${week}`);
}
