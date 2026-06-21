/**
 * -------------------------------------------------------
 * API Route: Admin Users Management
 * Étape 11 — GET + PATCH /api/admin/users
 *
 * GET  — List all users (admin only, uses service_role to bypass RLS)
 * -------------------------------------------------------
 */

import { NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

async function verifyAdmin() {
  const userClient = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  const adminClient = getSupabaseServerAdminClient();
  const { data: account } = await adminClient
    .from('accounts')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!account || account.role !== 'admin') return null;
  return user;
}

export async function GET() {
  try {
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();
    const { data, error } = await adminClient
      .from('accounts')
      .select('id, name, email, role, criticality_level, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: data });
  } catch (err) {
    console.error('[API /api/admin/users GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
