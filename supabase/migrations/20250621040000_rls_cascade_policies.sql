/*
 * -------------------------------------------------------
 * Migration: RLS cascade policies (RBAC documentaire)
 * Étape 4 — Replaces deny-all temp policies with real cascade logic
 * Ref: section 4 du cahier des charges
 *
 * Cascade rule:
 *   ADMIN          → sees everything
 *   HIGH           → sees HIGH + MEDIUM + LOW
 *   MEDIUM         → sees MEDIUM + LOW
 *   LOW            → sees LOW only
 * -------------------------------------------------------
 */

-- =============================================
-- Utility function: map criticality to numeric order
-- =============================================
create or replace function public.criticality_order(level public.criticality_level)
returns integer
language sql
immutable
as $$
    select case level
        when 'low'    then 1
        when 'medium' then 2
        when 'high'   then 3
    end;
$$;

grant execute on function public.criticality_order(public.criticality_level) to authenticated, service_role;

-- =============================================
-- Helper: get current user's role from accounts
-- =============================================
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
    select role from public.accounts where id = (select auth.uid());
$$;

grant execute on function public.current_user_role() to authenticated, service_role;

-- =============================================
-- Helper: get current user's criticality level from accounts
-- =============================================
create or replace function public.current_user_criticality()
returns public.criticality_level
language sql
stable
security definer
set search_path = ''
as $$
    select criticality_level from public.accounts where id = (select auth.uid());
$$;

grant execute on function public.current_user_criticality() to authenticated, service_role;

-- =============================================
-- Drop temporary deny-all policies
-- =============================================
drop policy if exists documents_deny_all on public.documents;
drop policy if exists document_chunks_deny_all on public.document_chunks;
drop policy if exists audit_trail_deny_all on public.audit_trail;

-- =============================================
-- DOCUMENTS: SELECT policy (cascade)
-- =============================================
create policy documents_select_cascade on public.documents
    for select
    to authenticated
    using (
        -- Admin sees everything
        public.current_user_role() = 'admin'
        or
        -- User sees documents where their criticality >= document criticality
        public.criticality_order(public.current_user_criticality())
            >= public.criticality_order(criticality)
    );

-- DOCUMENTS: INSERT/UPDATE/DELETE reserved for admin
create policy documents_admin_write on public.documents
    for insert
    to authenticated
    with check (
        public.current_user_role() = 'admin'
    );

create policy documents_admin_update on public.documents
    for update
    to authenticated
    using (
        public.current_user_role() = 'admin'
    )
    with check (
        public.current_user_role() = 'admin'
    );

create policy documents_admin_delete on public.documents
    for delete
    to authenticated
    using (
        public.current_user_role() = 'admin'
    );

-- =============================================
-- DOCUMENT_CHUNKS: SELECT policy (cascade via parent document)
-- =============================================
create policy document_chunks_select_cascade on public.document_chunks
    for select
    to authenticated
    using (
        exists (
            select 1 from public.documents d
            where d.id = document_id
            -- The documents table RLS will already filter,
            -- but we also enforce here for defense-in-depth
            and (
                public.current_user_role() = 'admin'
                or
                public.criticality_order(public.current_user_criticality())
                    >= public.criticality_order(d.criticality)
            )
        )
    );

-- DOCUMENT_CHUNKS: INSERT/UPDATE/DELETE reserved for admin
create policy document_chunks_admin_write on public.document_chunks
    for insert
    to authenticated
    with check (
        public.current_user_role() = 'admin'
    );

create policy document_chunks_admin_update on public.document_chunks
    for update
    to authenticated
    using (
        public.current_user_role() = 'admin'
    )
    with check (
        public.current_user_role() = 'admin'
    );

create policy document_chunks_admin_delete on public.document_chunks
    for delete
    to authenticated
    using (
        public.current_user_role() = 'admin'
    );

-- =============================================
-- AUDIT_TRAIL: user sees own entries, admin sees all
-- =============================================
create policy audit_trail_select on public.audit_trail
    for select
    to authenticated
    using (
        public.current_user_role() = 'admin'
        or user_id = (select auth.uid())
    );

-- AUDIT_TRAIL: any authenticated user can insert (for logging their own actions)
create policy audit_trail_insert on public.audit_trail
    for insert
    to authenticated
    with check (
        user_id = (select auth.uid())
    );

-- AUDIT_TRAIL: no update/delete (immutable log)
-- (No policy = denied by default with RLS enabled)
