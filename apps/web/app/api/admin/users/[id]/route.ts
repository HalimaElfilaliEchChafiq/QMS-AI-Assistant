/**
 * -------------------------------------------------------
 * API Route: Admin User Update
 * Étape 11 — PATCH /api/admin/users/[id]
 *
 * Updates a user's criticality_level (and optionally role).
 * Server-side admin check. Logs changes to audit_trail.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const VALID_CRITICALITIES = ['low', 'medium', 'high'] as const;
const VALID_ROLES = ['admin', 'user'] as const;

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await verifyAdmin();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const { id: targetUserId } = await params;
    const body = await request.json();

    // Validate fields
    if (
      body.criticality_level &&
      !VALID_CRITICALITIES.includes(body.criticality_level)
    ) {
      return NextResponse.json(
        { error: 'criticality_level must be one of: low, medium, high' },
        { status: 400 },
      );
    }

    if (body.role && !VALID_ROLES.includes(body.role)) {
      return NextResponse.json(
        { error: 'role must be one of: admin, user' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();

    // Build update
    const updateData: Record<string, unknown> = {};
    if (body.criticality_level !== undefined)
      updateData.criticality_level = body.criticality_level;
    if (body.role !== undefined) updateData.role = body.role;
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 },
      );
    }

    const { data, error } = await adminClient
      .from('accounts')
      .update(updateData)
      .eq('id', targetUserId)
      .select('id, name, email, role, criticality_level')
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 },
      );
    }

    // Log to audit_trail
    const changedFields = Object.keys(updateData)
      .filter((k) => k !== 'updated_at')
      .join(', ');

    await adminClient.from('audit_trail').insert({
      user_id: currentUser.id,
      action: 'role_change',
      query: `Updated user ${data.email}: ${changedFields} → ${body.criticality_level || ''} ${body.role || ''}`.trim(),
    });

    return NextResponse.json({ success: true, user: data });
  } catch (err) {
    console.error('[API /api/admin/users/[id]] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
