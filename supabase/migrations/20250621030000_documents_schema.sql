/*
 * -------------------------------------------------------
 * Migration: Documents, document_chunks, audit_trail
 * Étape 3 — Schéma documentaire et journal d'audit
 * Ref: section 3.2 du cahier des charges
 * -------------------------------------------------------
 */

-- =============================================
-- Table: documents
-- =============================================
create table if not exists public.documents (
    id          uuid primary key default extensions.uuid_generate_v4(),
    title       text not null,
    file_path   text not null,                               -- path in Supabase Storage
    criticality public.criticality_level not null,           -- reuses enum from Step 2
    doc_type    text,                                        -- e.g. "Procédure", "Instruction", "PFMEA"
    version     text default 'v1',
    owner       text,
    site        text,
    language    text default 'fr',
    source      text not null default 'manual'
        check (source in ('manual', 'sharepoint')),
    ingested_at timestamptz default now(),
    updated_at  timestamptz default now()
);

comment on table public.documents is 'QMS documents with criticality-based access control';

-- =============================================
-- Table: document_chunks
-- Embedding dimension: 768 (nomic-embed-text default)
-- =============================================
create table if not exists public.document_chunks (
    id          uuid primary key default extensions.uuid_generate_v4(),
    document_id uuid not null references public.documents(id) on delete cascade,
    content     text not null,
    embedding   extensions.vector(768),                      -- 768-dim for nomic-embed-text
    chunk_index integer not null default 0,
    tsv         tsvector generated always as (
                    to_tsvector('english', content)
                ) stored,
    metadata    jsonb default '{}'::jsonb
);

comment on table public.document_chunks is 'Semantic chunks of documents with vector embeddings and full-text search';

-- =============================================
-- Table: audit_trail
-- =============================================
create table if not exists public.audit_trail (
    id          uuid primary key default extensions.uuid_generate_v4(),
    user_id     uuid references auth.users(id),
    action      text not null,                               -- e.g. 'ingestion', 'search', 'role_change', 'document_view'
    document_id uuid references public.documents(id) on delete set null,
    query       text,                                        -- search query if applicable
    created_at  timestamptz default now()
);

comment on table public.audit_trail is 'Immutable log of all user actions for compliance and traceability';

-- =============================================
-- Enable RLS on all three tables with temporary DENY ALL
-- (Real policies come in Step 4)
-- =============================================
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.audit_trail enable row level security;

-- Temporary deny-all policies (will be replaced in Step 4)
-- These ensure no data leaks between Step 3 and Step 4
create policy documents_deny_all on public.documents
    for all to authenticated using (false);

create policy document_chunks_deny_all on public.document_chunks
    for all to authenticated using (false);

create policy audit_trail_deny_all on public.audit_trail
    for all to authenticated using (false);

-- =============================================
-- Indexes
-- =============================================

-- HNSW index on embeddings for fast approximate nearest neighbor search
create index if not exists idx_document_chunks_embedding
    on public.document_chunks
    using hnsw (embedding extensions.vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- GIN index on tsvector for full-text search
create index if not exists idx_document_chunks_tsv
    on public.document_chunks
    using gin (tsv);

-- Index on document_id for fast chunk lookups
create index if not exists idx_document_chunks_document_id
    on public.document_chunks (document_id);

-- Index on audit_trail for user-based queries
create index if not exists idx_audit_trail_user_id
    on public.audit_trail (user_id);

-- Index on audit_trail for time-based queries
create index if not exists idx_audit_trail_created_at
    on public.audit_trail (created_at desc);

-- =============================================
-- Grants: allow authenticated + service_role to access tables
-- (actual access controlled by RLS policies)
-- =============================================
grant select, insert, update, delete on public.documents to authenticated, service_role;
grant select, insert, update, delete on public.document_chunks to authenticated, service_role;
grant select, insert, update, delete on public.audit_trail to authenticated, service_role;

-- =============================================
-- Storage: Create a dedicated bucket for QMS documents
-- =============================================
insert into storage.buckets (id, name, public)
values ('qms_documents', 'qms_documents', false)
on conflict (id) do nothing;
