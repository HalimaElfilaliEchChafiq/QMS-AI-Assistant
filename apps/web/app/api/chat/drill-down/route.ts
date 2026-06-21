/**
 * -------------------------------------------------------
 * API Route: F1 Drill-Down — Detailed Excerpt
 * Étape 14 — POST /api/chat/drill-down
 *
 * Receives a chunkId + question, returns the full excerpt
 * with document link and surrounding context.
 * This endpoint is called lazily when user clicks "See excerpt".
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { documentId, chunkIndex } = body as {
      documentId: string;
      chunkIndex: number;
    };

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 },
      );
    }

    // Fetch document metadata (RLS-filtered)
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, file_path, criticality, doc_type, version, owner, site, language')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found or not accessible' },
        { status: 404 },
      );
    }

    // Fetch the specific chunk and surrounding chunks for context
    const targetIndex = chunkIndex ?? 0;
    const { data: chunks, error: chunkError } = await supabase
      .from('document_chunks')
      .select('content, chunk_index, metadata')
      .eq('document_id', documentId)
      .gte('chunk_index', Math.max(0, targetIndex - 1))
      .lte('chunk_index', targetIndex + 1)
      .order('chunk_index', { ascending: true });

    if (chunkError) {
      return NextResponse.json(
        { error: chunkError.message },
        { status: 500 },
      );
    }

    // Build the detailed response
    const mainChunk = (chunks ?? []).find((c) => c.chunk_index === targetIndex);
    const contextBefore = (chunks ?? []).find(
      (c) => c.chunk_index === targetIndex - 1,
    );
    const contextAfter = (chunks ?? []).find(
      (c) => c.chunk_index === targetIndex + 1,
    );

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        filePath: doc.file_path,
        criticality: doc.criticality,
        docType: doc.doc_type,
        version: doc.version,
        owner: doc.owner,
        site: doc.site,
        language: doc.language,
      },
      excerpt: {
        content: mainChunk?.content || '',
        chunkIndex: targetIndex,
        metadata: mainChunk?.metadata || {},
      },
      context: {
        before: contextBefore?.content || null,
        after: contextAfter?.content || null,
      },
    });
  } catch (err) {
    console.error('[API /api/chat/drill-down] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
