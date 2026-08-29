import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/ProfileForm';
import PasswordForm from '@/components/PasswordForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-wide text-chalk">Your Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Set the name your friends will see next to your picks.
        </p>
      </div>
      <ProfileForm
        initialDisplayName={profile?.display_name ?? ''}
        email={profile?.email ?? user.email ?? ''}
      />
      <PasswordForm />
    </div>
  );
}
