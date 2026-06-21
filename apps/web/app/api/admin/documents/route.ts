/**
 * -------------------------------------------------------
 * API Route: Admin Document Upload + Ingestion
 * Étape 10 — POST /api/admin/documents
 *
 * Accepts multipart/form-data with:
 *   - file: the document file (PDF, DOCX, TXT, MD)
 *   - criticality: 'low' | 'medium' | 'high' (REQUIRED)
 *   - title, doc_type, version, owner, site, language (optional)
 *
 * Server-side admin check + double validation on criticality.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const VALID_CRITICALITIES = ['low', 'medium', 'high'] as const;
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

// ---------------------------------------------------------------------------
// Admin check helper
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/admin/documents — Upload + Ingest
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdmin();

    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const criticality = formData.get('criticality') as string | null;
    const title = (formData.get('title') as string) || undefined;
    const docType = (formData.get('doc_type') as string) || undefined;
    const version = (formData.get('version') as string) || 'v1';
    const owner = (formData.get('owner') as string) || undefined;
    const site = (formData.get('site') as string) || undefined;
    const language = (formData.get('language') as string) || 'fr';

    // --- Double validation: criticality is mandatory ---
    if (!criticality || !VALID_CRITICALITIES.includes(criticality as typeof VALID_CRITICALITIES[number])) {
      return NextResponse.json(
        { error: 'Criticality is required and must be one of: low, medium, high' },
        { status: 400 },
      );
    }

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: 'A document file is required' },
        { status: 400 },
      );
    }

    // Validate file extension
    const fileName = file.name;
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();
    const docTitle = title || fileName.replace(/\.[^/.]+$/, '');

    // 1. Upload file to Storage
    const storagePath = `uploads/${Date.now()}_${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from('qms_documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `File upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // 2. Insert document row
    const { data: docRow, error: docError } = await adminClient
      .from('documents')
      .insert({
        title: docTitle,
        file_path: storagePath,
        criticality: criticality as typeof VALID_CRITICALITIES[number],
        doc_type: docType || null,
        version,
        owner: owner || null,
        site: site || null,
        language,
        source: 'manual',
      })
      .select('id')
      .single();

    if (docError) {
      // Clean up uploaded file on document insert failure
      await adminClient.storage.from('qms_documents').remove([storagePath]);
      return NextResponse.json(
        { error: `Document insert failed: ${docError.message}` },
        { status: 500 },
      );
    }

    // 3. Log to audit_trail
    await adminClient.from('audit_trail').insert({
      user_id: user.id,
      action: 'document_upload',
      document_id: docRow.id,
      query: `Uploaded: ${docTitle} (${criticality})`,
    });

    return NextResponse.json({
      success: true,
      document: {
        id: docRow.id,
        title: docTitle,
        criticality,
        file_path: storagePath,
      },
    });
  } catch (err) {
    console.error('[API /api/admin/documents] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/documents — List all documents
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

    const adminClient = getSupabaseServerAdminClient();
    const { data, error } = await adminClient
      .from('documents')
      .select('*')
      .order('ingested_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ documents: data });
  } catch (err) {
    console.error('[API /api/admin/documents GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
