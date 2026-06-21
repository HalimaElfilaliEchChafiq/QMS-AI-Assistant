/**
 * -------------------------------------------------------
 * API Route: Admin Document Edit
 * Étape 10 — PATCH /api/admin/documents/[id]
 *
 * Updates document metadata (criticality, doc_type, version,
 * owner, site, language). Server-side admin check.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const VALID_CRITICALITIES = ['low', 'medium', 'high'] as const;

async function verifyAdmin() {
  const userClient = getSupabaseServerClient();
  const { data: { user }, error } = await userClient.auth.getUser();
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
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Validate criticality if provided
    if (body.criticality && !VALID_CRITICALITIES.includes(body.criticality)) {
      return NextResponse.json(
        { error: 'Criticality must be one of: low, medium, high' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.criticality !== undefined) updateData.criticality = body.criticality;
    if (body.doc_type !== undefined) updateData.doc_type = body.doc_type;
    if (body.version !== undefined) updateData.version = body.version;
    if (body.owner !== undefined) updateData.owner = body.owner;
    if (body.site !== undefined) updateData.site = body.site;
    if (body.language !== undefined) updateData.language = body.language;
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length <= 1) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 },
      );
    }

    const { data, error } = await adminClient
      .from('documents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 },
      );
    }

    // Log to audit_trail
    await adminClient.from('audit_trail').insert({
      user_id: user.id,
      action: 'document_edit',
      document_id: id,
      query: `Updated metadata: ${Object.keys(updateData).filter(k => k !== 'updated_at').join(', ')}`,
    });

    return NextResponse.json({ success: true, document: data });
  } catch (err) {
    console.error('[API /api/admin/documents/[id]] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
