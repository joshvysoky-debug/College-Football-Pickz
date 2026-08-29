import { redirect } from 'next/navigation';
import { currentSeasonAndWeek } from '@/lib/cfbd';

export default function RecapIndexPage() {
  const { week } = currentSeasonAndWeek();
  redirect(`/recap/${week}`);
}
