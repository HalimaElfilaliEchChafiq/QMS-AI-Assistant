/**
 * -------------------------------------------------------
 * API Route: Hybrid Search
 * Étape 9 — Ref: section 6 (F2, F3) du cahier des charges
 *
 * POST /api/search
 *
 * Accepts a JSON body with:
 *   - query: string (required)
 *   - filters: { docType?, site?, language?, dateFrom?, dateTo? }
 *   - options: { limit?, similarityThreshold?, vectorWeight?, fulltextWeight? }
 *
 * Returns RLS-filtered results based on the authenticated user's
 * criticality level. A LOW user will never see HIGH/MEDIUM documents.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  HybridSearch,
  type SearchFilters,
  type SearchOptions,
} from '@kit/ingestion/hybrid-search';

// ---------------------------------------------------------------------------
// Request validation schema (Zod)
// ---------------------------------------------------------------------------
const searchRequestSchema = z.object({
  query: z
    .string()
    .min(1, 'Query is required')
    .max(2000, 'Query too long'),

  filters: z
    .object({
      docType: z.string().optional(),
      site: z.string().optional(),
      language: z.string().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })
    .optional(),

  options: z
    .object({
      limit: z.number().int().min(1).max(50).optional(),
      similarityThreshold: z.number().min(0).max(1).optional(),
      vectorWeight: z.number().min(0).max(1).optional(),
      fulltextWeight: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/search
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const validation = searchRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { query, filters, options } = validation.data;

    // 2. Get authenticated Supabase client (RLS context)
    const supabase = getSupabaseServerClient();

    // 3. Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized — authentication required' },
        { status: 401 },
      );
    }

    // 4. Execute hybrid search
    const search = new HybridSearch(supabase);

    const searchFilters: SearchFilters | undefined = filters
      ? {
          docType: filters.docType,
          site: filters.site,
          language: filters.language,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }
      : undefined;

    const searchOptions: SearchOptions | undefined = options
      ? {
          limit: options.limit,
          similarityThreshold: options.similarityThreshold,
          vectorWeight: options.vectorWeight,
          fulltextWeight: options.fulltextWeight,
        }
      : undefined;

    const results = await search.search(query, searchFilters, searchOptions);

    // 5. Return structured response
    return NextResponse.json({
      query,
      resultCount: results.length,
      results: results.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        content: r.content,
        chunkIndex: r.chunkIndex,
        metadata: r.metadata,
        scores: {
          similarity: r.similarity,
          fulltextRank: r.fulltextRank,
          combined: r.combinedScore,
        },
        document: r.document,
      })),
    });
  } catch (err) {
    console.error('[API /api/search] Error:', err);

    // Return 500 only for truly unexpected errors
    // Filter mismatches should return empty results, not 500
    const message =
      err instanceof Error ? err.message : 'Internal server error';

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
