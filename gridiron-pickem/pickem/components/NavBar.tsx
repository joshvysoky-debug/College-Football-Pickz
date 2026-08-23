import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export default async function NavBar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-field-line bg-field-panel/60 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="text-center font-display text-2xl tracking-wide text-chalk sm:text-3xl"
        >
          It&rsquo;s football time in <span className="text-bulb">Tennessee</span>
        </Link>
        {user && (
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted transition hover:text-bulb-bright">
              This week
            </Link>
            <Link href="/standings" className="text-muted transition hover:text-bulb-bright">
              Standings
            </Link>
            <SignOutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
