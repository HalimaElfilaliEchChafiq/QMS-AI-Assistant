/**
 * -------------------------------------------------------
 * API Route: SharePoint Configuration & Connection Test
 * Étape 24 — Phase 6: Connecteur SharePoint
 *
 * GET  /api/admin/sharepoint/config — Check configuration status
 * POST /api/admin/sharepoint/config — Test the connection
 *
 * Admin-only routes.
 * -------------------------------------------------------
 */

import { NextResponse } from 'next/server';

import {
  isSharePointConfigured,
  loadSharePointConfig,
  testConnection,
} from '@kit/ingestion/sharepoint-connector';
import { getCriticalityMapDescription } from '@kit/ingestion/sharepoint-permissions';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// Admin check (same pattern as other admin routes)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/admin/sharepoint/config — Configuration status
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const configured = isSharePointConfigured();
    const { map, description } = getCriticalityMapDescription();

    // Count synced documents
    const adminClient = getSupabaseServerAdminClient();
    const { count } = await adminClient
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'sharepoint');

    return NextResponse.json({
      configured,
      syncedDocuments: count || 0,
      criticalityMap: map,
      criticalityDescription: description,
      // Show which env vars are set (without revealing values)
      envStatus: {
        SHAREPOINT_TENANT_ID: !!process.env.SHAREPOINT_TENANT_ID,
        SHAREPOINT_CLIENT_ID: !!process.env.SHAREPOINT_CLIENT_ID,
        SHAREPOINT_CLIENT_SECRET: !!process.env.SHAREPOINT_CLIENT_SECRET,
        SHAREPOINT_SITE_ID: !!process.env.SHAREPOINT_SITE_ID,
        SHAREPOINT_DRIVE_ID: !!process.env.SHAREPOINT_DRIVE_ID,
      },
    });
  } catch (err) {
    console.error('[API /api/admin/sharepoint/config GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/sharepoint/config — Test connection
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    if (!isSharePointConfigured()) {
      return NextResponse.json(
        {
          error:
            'SharePoint is not configured. Set the required environment variables: ' +
            'SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, ' +
            'SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID',
        },
        { status: 400 },
      );
    }

    const config = loadSharePointConfig();
    const result = await testConnection(config);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[API /api/admin/sharepoint/config POST] Error:', err);
    const message = err instanceof Error ? err.message : 'Connection test failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
