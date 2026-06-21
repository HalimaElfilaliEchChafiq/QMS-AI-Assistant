/*
 * -------------------------------------------------------
 * Migration: Hybrid search functions (Dense + Sparse)
 * Étape 8 — Ref: section 6 (F2) du cahier des charges
 *
 * Creates SQL functions for:
 *   1. Vector similarity search (cosine distance via pgvector)
 *   2. Full-text search (tsvector + ts_rank)
 *   3. Combined hybrid search with weighted fusion
 *
 * All functions respect RLS natively: they query tables
 * in the caller's security context, so results are already
 * filtered by the user's criticality_level.
 *
 * NOTE: The <=> operator lives in the extensions schema,
 * so we use OPERATOR(extensions.<=>) explicitly.
 * -------------------------------------------------------
 */

-- =============================================
-- 1. Vector (Dense) search function
-- =============================================
create or replace function public.search_chunks_vector(
    query_embedding extensions.vector(768),
    match_count integer default 10,
    similarity_threshold float default 0.3
)
returns table (
    chunk_id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    metadata jsonb,
    similarity float
)
language sql
stable
security invoker
as $$
    select
        dc.id            as chunk_id,
        dc.document_id   as document_id,
        dc.content        as content,
        dc.chunk_index    as chunk_index,
        dc.metadata       as metadata,
        1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
    from public.document_chunks dc
    where 1 - (dc.embedding OPERATOR(extensions.<=>) query_embedding) > similarity_threshold
    order by dc.embedding OPERATOR(extensions.<=>) query_embedding
    limit match_count;
$$;

comment on function public.search_chunks_vector
    is 'Vector similarity search on document_chunks. RLS-filtered via security invoker.';

grant execute on function public.search_chunks_vector(extensions.vector(768), integer, float)
    to authenticated, service_role;

-- =============================================
-- 2. Full-text (Sparse) search function
-- =============================================
create or replace function public.search_chunks_fulltext(
    search_query text,
    match_count integer default 10
)
returns table (
    chunk_id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    metadata jsonb,
    rank float
)
language sql
stable
security invoker
as $$
    select
        dc.id            as chunk_id,
        dc.document_id   as document_id,
        dc.content        as content,
        dc.chunk_index    as chunk_index,
        dc.metadata       as metadata,
        ts_rank_cd(dc.tsv, websearch_to_tsquery('english', search_query)) as rank
    from public.document_chunks dc
    where dc.tsv @@ websearch_to_tsquery('english', search_query)
    order by rank desc
    limit match_count;
$$;

comment on function public.search_chunks_fulltext
    is 'Full-text search on document_chunks using tsvector/ts_rank. RLS-filtered via security invoker.';

grant execute on function public.search_chunks_fulltext(text, integer)
    to authenticated, service_role;

-- =============================================
-- 3. Hybrid search function (Dense + Sparse fusion)
--    Uses Reciprocal Rank Fusion (RRF) to combine both rankings.
--    RRF score = 1/(k + rank_position) for each result set.
--    The constant k=60 is standard (from the original RRF paper).
-- =============================================
create or replace function public.search_chunks_hybrid(
    query_embedding extensions.vector(768),
    search_query text,
    match_count integer default 10,
    similarity_threshold float default 0.3,
    vector_weight float default 0.6,
    fulltext_weight float default 0.4
)
returns table (
    chunk_id uuid,
    document_id uuid,
    content text,
    chunk_index integer,
    metadata jsonb,
    similarity float,
    fulltext_rank float,
    combined_score float,
    doc_title text,
    doc_criticality public.criticality_level,
    doc_type text,
    doc_language text,
    doc_site text,
    doc_version text
)
language sql
stable
security invoker
as $$
    with
    vector_results as (
        select
            v.chunk_id,
            v.document_id,
            v.content,
            v.chunk_index,
            v.metadata,
            v.similarity,
            row_number() over (order by v.similarity desc) as rrf_rank
        from public.search_chunks_vector(
            query_embedding,
            match_count * 2,
            similarity_threshold
        ) v
    ),
    fulltext_results as (
        select
            f.chunk_id,
            f.document_id,
            f.content,
            f.chunk_index,
            f.metadata,
            f.rank as fulltext_rank,
            row_number() over (order by f.rank desc) as rrf_rank
        from public.search_chunks_fulltext(
            search_query,
            match_count * 2
        ) f
    ),
    merged as (
        select
            coalesce(v.chunk_id, f.chunk_id) as chunk_id,
            coalesce(v.document_id, f.document_id) as document_id,
            coalesce(v.content, f.content) as content,
            coalesce(v.chunk_index, f.chunk_index) as chunk_index,
            coalesce(v.metadata, f.metadata) as metadata,
            coalesce(v.similarity, 0) as similarity,
            coalesce(f.fulltext_rank, 0) as fulltext_rank,
            (
                vector_weight * coalesce(1.0 / (60 + v.rrf_rank), 0) +
                fulltext_weight * coalesce(1.0 / (60 + f.rrf_rank), 0)
            ) as combined_score
        from vector_results v
        full outer join fulltext_results f on v.chunk_id = f.chunk_id
    )
    select
        m.chunk_id,
        m.document_id,
        m.content,
        m.chunk_index,
        m.metadata,
        m.similarity,
        m.fulltext_rank,
        m.combined_score,
        d.title         as doc_title,
        d.criticality   as doc_criticality,
        d.doc_type      as doc_type,
        d.language      as doc_language,
        d.site          as doc_site,
        d.version       as doc_version
    from merged m
    join public.documents d on d.id = m.document_id
    order by m.combined_score desc
    limit match_count;
$$;

comment on function public.search_chunks_hybrid
    is 'Hybrid search combining vector similarity and full-text ranking via RRF. RLS-filtered via security invoker.';

grant execute on function public.search_chunks_hybrid(
    extensions.vector(768), text, integer, float, float, float
) to authenticated, service_role;
