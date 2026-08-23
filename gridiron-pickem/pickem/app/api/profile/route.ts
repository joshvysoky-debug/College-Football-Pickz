import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  const body = await request.json();
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
  }
  if (displayName.length > 24) {
    return NextResponse.json(
      { error: 'Display name must be 24 characters or fewer' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, displayName });
}
