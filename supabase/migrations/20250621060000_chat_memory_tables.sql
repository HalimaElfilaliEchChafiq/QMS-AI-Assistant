/*
 * -------------------------------------------------------
 * Migration: Chat Sessions, Messages & Semantic Memory
 * Étape 13 — Phase 4: Cœur du Chat IA
 * Ref: section 3.3 du cahier des charges
 * -------------------------------------------------------
 */

-- =============================================
-- Table: chat_sessions
-- =============================================
create table if not exists public.chat_sessions (
    id          uuid primary key default extensions.uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    title       text not null default 'New Conversation',
    language_mode text not null default 'source_language'
        check (language_mode in ('english_only', 'source_language', 'french_with_english_citations')),
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

comment on table public.chat_sessions is 'User chat sessions with the QMS assistant';

-- =============================================
-- Table: chat_messages
-- =============================================
create table if not exists public.chat_messages (
    id               uuid primary key default extensions.uuid_generate_v4(),
    session_id       uuid not null references public.chat_sessions(id) on delete cascade,
    role             text not null check (role in ('user', 'assistant')),
    content          text not null,
    sources          jsonb default '[]'::jsonb,
    confidence_level text check (confidence_level in ('low', 'medium', 'high', null)),
    created_at       timestamptz default now()
);

comment on table public.chat_messages is 'Individual messages within chat sessions, including AI responses with sources and confidence';

-- =============================================
-- Table: memory_semantic
-- =============================================
create table if not exists public.memory_semantic (
    id          uuid primary key default extensions.uuid_generate_v4(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    fact        text not null,
    category    text not null default 'general',
    created_at  timestamptz default now()
);

comment on table public.memory_semantic is 'Persistent semantic memory: key facts extracted from user conversations';

-- =============================================
-- Enable RLS
-- =============================================
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.memory_semantic enable row level security;

-- =============================================
-- RLS Policies: chat_sessions (user owns their sessions)
-- =============================================
create policy chat_sessions_select on public.chat_sessions
    for select to authenticated
    using (auth.uid() = user_id);

create policy chat_sessions_insert on public.chat_sessions
    for insert to authenticated
    with check (auth.uid() = user_id);

create policy chat_sessions_update on public.chat_sessions
    for update to authenticated
    using (auth.uid() = user_id);

create policy chat_sessions_delete on public.chat_sessions
    for delete to authenticated
    using (auth.uid() = user_id);

-- =============================================
-- RLS Policies: chat_messages (via session ownership)
-- =============================================
create policy chat_messages_select on public.chat_messages
    for select to authenticated
    using (
        exists (
            select 1 from public.chat_sessions s
            where s.id = chat_messages.session_id
            and s.user_id = auth.uid()
        )
    );

create policy chat_messages_insert on public.chat_messages
    for insert to authenticated
    with check (
        exists (
            select 1 from public.chat_sessions s
            where s.id = chat_messages.session_id
            and s.user_id = auth.uid()
        )
    );

-- =============================================
-- RLS Policies: memory_semantic (user owns their memories)
-- =============================================
create policy memory_semantic_select on public.memory_semantic
    for select to authenticated
    using (auth.uid() = user_id);

create policy memory_semantic_insert on public.memory_semantic
    for insert to authenticated
    with check (auth.uid() = user_id);

create policy memory_semantic_delete on public.memory_semantic
    for delete to authenticated
    using (auth.uid() = user_id);

-- =============================================
-- Indexes
-- =============================================
create index if not exists idx_chat_sessions_user_id
    on public.chat_sessions (user_id);

create index if not exists idx_chat_sessions_updated_at
    on public.chat_sessions (updated_at desc);

create index if not exists idx_chat_messages_session_id
    on public.chat_messages (session_id);

create index if not exists idx_chat_messages_created_at
    on public.chat_messages (created_at asc);

create index if not exists idx_memory_semantic_user_id
    on public.memory_semantic (user_id);

-- =============================================
-- Grants
-- =============================================
grant select, insert, update, delete on public.chat_sessions to authenticated, service_role;
grant select, insert, update, delete on public.chat_messages to authenticated, service_role;
grant select, insert, update, delete on public.memory_semantic to authenticated, service_role;
