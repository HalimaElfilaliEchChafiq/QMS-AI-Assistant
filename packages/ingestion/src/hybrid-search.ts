/**
 * -------------------------------------------------------
 * RAG Hybrid Search Module
 * Étape 8 — Ref: section 6 (F2) du cahier des charges
 *
 * Combines dense (vector) and sparse (full-text) search
 * via SQL functions defined in the hybrid_search_functions
 * migration. Results are RLS-filtered by user context.
 * -------------------------------------------------------
 */

import { type SupabaseClient } from '@supabase/supabase-js';

import {
  createEmbeddingProvider,
  type EmbeddingProvider,
} from './embeddings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFilters {
  /** Filter by document type (e.g. "Procédure", "PFMEA") */
  docType?: string;
  /** Filter by site */
  site?: string;
  /** Filter by language */
  language?: string;
  /** Filter by date range — start (inclusive) */
  dateFrom?: string;
  /** Filter by date range — end (inclusive) */
  dateTo?: string;
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum vector similarity threshold (default: 0.3) */
  similarityThreshold?: number;
  /** Weight for vector search (0-1, default: 0.6) */
  vectorWeight?: number;
  /** Weight for full-text search (0-1, default: 0.4) */
  fulltextWeight?: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  similarity: number;
  fulltextRank: number;
  combinedScore: number;
  document: {
    title: string;
    criticality: string;
    docType: string | null;
    language: string | null;
    site: string | null;
    version: string | null;
  };
}

// ---------------------------------------------------------------------------
// Hybrid Search class
// ---------------------------------------------------------------------------

export class HybridSearch {
  private supabase: SupabaseClient;
  private embeddingProvider: EmbeddingProvider;

  constructor(
    supabase: SupabaseClient,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.supabase = supabase;
    this.embeddingProvider =
      embeddingProvider ?? createEmbeddingProvider();
  }

  /**
   * Execute a hybrid search combining vector similarity and full-text search.
   * Results are automatically filtered by the user's RLS policies.
   */
  async search(
    query: string,
    filters?: SearchFilters,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const similarityThreshold = options?.similarityThreshold ?? 0.3;
    const vectorWeight = options?.vectorWeight ?? 0.6;
    const fulltextWeight = options?.fulltextWeight ?? 0.4;

    // 1. Generate embedding for the query
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // 2. Call the hybrid search SQL function via RPC
    const { data, error } = await this.supabase.rpc(
      'search_chunks_hybrid',
      {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        search_query: query,
        match_count: limit,
        similarity_threshold: similarityThreshold,
        vector_weight: vectorWeight,
        fulltext_weight: fulltextWeight,
      },
    );

    if (error) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // 3. Apply post-query filters (doc_type, site, language, date range)
    //    Note: These filters are applied post-RPC because the SQL function
    //    doesn't accept dynamic filter parameters. For production, these
    //    should be moved into the SQL function for better performance.
    let results = (data as RawHybridResult[]).map(mapToSearchResult);

    if (filters) {
      results = applyFilters(results, filters);
    }

    return results;
  }

  /**
   * Execute a pure vector search (no full-text component).
   */
  async vectorSearch(
    query: string,
    limit = 10,
    similarityThreshold = 0.3,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingProvider.embed(query);

    const { data, error } = await this.supabase.rpc(
      'search_chunks_vector',
      {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_count: limit,
        similarity_threshold: similarityThreshold,
      },
    );

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Enrich with document metadata
    const chunkIds = (data as RawVectorResult[]).map((r) => r.document_id);
    const { data: docs } = await this.supabase
      .from('documents')
      .select('id, title, criticality, doc_type, language, site, version')
      .in('id', chunkIds);

    const docMap = new Map(
      (docs ?? []).map((d) => [d.id, d]),
    );

    return (data as RawVectorResult[]).map((r) => {
      const doc = docMap.get(r.document_id);
      return {
        chunkId: r.chunk_id,
        documentId: r.document_id,
        content: r.content,
        chunkIndex: r.chunk_index,
        metadata: r.metadata ?? {},
        similarity: r.similarity,
        fulltextRank: 0,
        combinedScore: r.similarity,
        document: {
          title: doc?.title ?? 'Unknown',
          criticality: doc?.criticality ?? 'low',
          docType: doc?.doc_type ?? null,
          language: doc?.language ?? null,
          site: doc?.site ?? null,
          version: doc?.version ?? null,
        },
      };
    });
  }

  /**
   * Execute a pure full-text search (no vector component).
   * Useful for exact reference queries like "Procédure QMS-042".
   */
  async fulltextSearch(
    query: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc(
      'search_chunks_fulltext',
      {
        search_query: query,
        match_count: limit,
      },
    );

    if (error) {
      throw new Error(`Full-text search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Enrich with document metadata
    const chunkIds = (data as RawFulltextResult[]).map((r) => r.document_id);
    const { data: docs } = await this.supabase
      .from('documents')
      .select('id, title, criticality, doc_type, language, site, version')
      .in('id', chunkIds);

    const docMap = new Map(
      (docs ?? []).map((d) => [d.id, d]),
    );

    return (data as RawFulltextResult[]).map((r) => {
      const doc = docMap.get(r.document_id);
      return {
        chunkId: r.chunk_id,
        documentId: r.document_id,
        content: r.content,
        chunkIndex: r.chunk_index,
        metadata: r.metadata ?? {},
        similarity: 0,
        fulltextRank: r.rank,
        combinedScore: r.rank,
        document: {
          title: doc?.title ?? 'Unknown',
          criticality: doc?.criticality ?? 'low',
          docType: doc?.doc_type ?? null,
          language: doc?.language ?? null,
          site: doc?.site ?? null,
          version: doc?.version ?? null,
        },
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Internal types for raw RPC responses
// ---------------------------------------------------------------------------

interface RawHybridResult {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
  fulltext_rank: number;
  combined_score: number;
  doc_title: string;
  doc_criticality: string;
  doc_type: string | null;
  doc_language: string | null;
  doc_site: string | null;
  doc_version: string | null;
}

interface RawVectorResult {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

interface RawFulltextResult {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  rank: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToSearchResult(raw: RawHybridResult): SearchResult {
  return {
    chunkId: raw.chunk_id,
    documentId: raw.document_id,
    content: raw.content,
    chunkIndex: raw.chunk_index,
    metadata: raw.metadata ?? {},
    similarity: raw.similarity,
    fulltextRank: raw.fulltext_rank,
    combinedScore: raw.combined_score,
    document: {
      title: raw.doc_title,
      criticality: raw.doc_criticality,
      docType: raw.doc_type,
      language: raw.doc_language,
      site: raw.doc_site,
      version: raw.doc_version,
    },
  };
}

function applyFilters(
  results: SearchResult[],
  filters: SearchFilters,
): SearchResult[] {
  return results.filter((r) => {
    if (
      filters.docType &&
      r.document.docType?.toLowerCase() !== filters.docType.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.site &&
      r.document.site?.toLowerCase() !== filters.site.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.language &&
      r.document.language?.toLowerCase() !== filters.language.toLowerCase()
    ) {
      return false;
    }

    // Date range filtering would require ingested_at from the document.
    // For now, these filters pass through (the API route handles date filtering
    // by adding a Supabase query constraint before RPC call if needed).

    return true;
  });
}
