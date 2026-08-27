import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export default async function NavBar() {
  const pathname = headers().get('x-pathname') ?? '';
  if (pathname.startsWith('/login')) {
    // The login page has its own full-size branded logo; showing the app
    // header on top of it as well would be redundant.
    return null;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-field-line bg-field-panel/60 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="CFB Game Time"
            width={1063}
            height={571}
            priority
            className="h-16 w-auto sm:h-20"
          />
        </Link>
        {user && (
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted transition hover:text-bulb-bright">
              This week
            </Link>
            <Link href="/standings" className="text-muted transition hover:text-bulb-bright">
              Standings
            </Link>
            <Link href="/playoff-picks" className="text-muted transition hover:text-bulb-bright">
              Playoff Picks
            </Link>
            <Link href="/profile" className="text-muted transition hover:text-bulb-bright">
              Profile
            </Link>
            <SignOutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
