/**
 * -------------------------------------------------------
 * API Route: Admin Audit Trail
 * Étape 12 — GET /api/admin/audit
 *
 * Returns audit_trail logs with optional filtering:
 *   - action: filter by action type (e.g. 'document_upload', 'role_change')
 *   - user_id: filter by specific user
 *   - from / to: date range (ISO strings)
 *   - search: full-text search on the `query` column
 *   - page / limit: pagination (default limit=50)
 *   - sort: 'asc' | 'desc' (default 'desc')
 *
 * Server-side admin check via verifyAdmin().
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// Admin check helper (same pattern as other admin APIs)
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
// GET /api/admin/audit — List audit trail logs
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '50', 10)),
    );
    const offset = (page - 1) * limit;

    // Sort direction
    const sort = searchParams.get('sort') === 'asc' ? true : false;

    // Filters
    const actionFilter = searchParams.get('action');
    const userIdFilter = searchParams.get('user_id');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const searchQuery = searchParams.get('search');

    const adminClient = getSupabaseServerAdminClient();

    // Build the query for audit_trail
    let query = adminClient
      .from('audit_trail')
      .select('id, user_id, action, document_id, query, created_at', {
        count: 'exact',
      });

    // Apply filters
    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }

    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    if (searchQuery) {
      query = query.ilike('query', `%${searchQuery}%`);
    }

    // Order and paginate
    query = query
      .order('created_at', { ascending: sort })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    // Resolve user names from accounts table
    // (audit_trail.user_id → auth.users.id = accounts.id)
    const userIds = [
      ...new Set(
        (data || []).map((r) => r.user_id).filter(Boolean) as string[],
      ),
    ];

    let userMap: Record<string, { name: string; email: string | null }> = {};

    if (userIds.length > 0) {
      const { data: accounts } = await adminClient
        .from('accounts')
        .select('id, name, email')
        .in('id', userIds);

      if (accounts) {
        userMap = Object.fromEntries(
          accounts.map((a) => [a.id, { name: a.name, email: a.email }]),
        );
      }
    }

    const logs = (data || []).map((row) => {
      const account = row.user_id ? userMap[row.user_id] : null;
      return {
        id: row.id,
        user_id: row.user_id,
        user_name: account?.name || 'System',
        user_email: account?.email || null,
        action: row.action,
        document_id: row.document_id,
        query: row.query,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    console.error('[API /api/admin/audit GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
