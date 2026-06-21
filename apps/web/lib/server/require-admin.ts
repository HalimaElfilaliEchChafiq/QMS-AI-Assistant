import 'server-only';

import { cache } from 'react';

import { redirect } from 'next/navigation';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { requireUser } from '@kit/supabase/require-user';

/**
 * @name requireAdmin
 * @description Require the user to be authenticated AND have role='admin'.
 * Redirects non-admin users to /home. Cached per-request.
 */
export const requireAdmin = cache(async () => {
  const client = getSupabaseServerClient();
  const result = await requireUser(client);

  if (result.error) {
    redirect(result.redirectTo);
  }

  const userId = result.data.sub ?? result.data.id;

  // Use admin client to bypass accounts RLS (which limits SELECT to own row)
  const adminClient = getSupabaseServerAdminClient();

  const { data: account, error: accountError } = await adminClient
    .from('accounts')
    .select('role')
    .eq('id', userId)
    .single();

  if (accountError || !account || account.role !== 'admin') {
    redirect('/home');
  }

  return { user: result.data, userId };
});
