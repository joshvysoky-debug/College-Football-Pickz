import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export default async function NavBar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-field-line bg-field-panel/60 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="CFB Game Time"
            width={1063}
            height={571}
            priority
            className="h-10 w-auto"
          />
        </Link>
        {user && (
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted transition hover:text-chalk">
              This week
            </Link>
            <Link href="/standings" className="text-muted transition hover:text-chalk">
              Standings
            </Link>
            <SignOutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
