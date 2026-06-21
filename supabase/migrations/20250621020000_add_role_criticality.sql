/*
 * -------------------------------------------------------
 * Migration: Add role and criticality_level to accounts
 * Étape 2 — Modèle de rôles & criticité
 * Extends the MakerKit accounts table with QMS-specific columns.
 * -------------------------------------------------------
 */

-- Create enum types for role and criticality
create type public.app_role as enum ('admin', 'user');
create type public.criticality_level as enum ('low', 'medium', 'high');

-- Add columns to accounts
alter table public.accounts
    add column if not exists role public.app_role not null default 'user',
    add column if not exists criticality_level public.criticality_level not null default 'low';

comment on column public.accounts.role is 'Application role: admin has full access, user is standard';
comment on column public.accounts.criticality_level is 'Document criticality clearance: low sees LOW only, medium sees LOW+MEDIUM, high sees all levels';

-- Update the trigger function to set defaults on new users
-- We replace the existing function to also include role and criticality_level
create or replace function kit.new_user_created_setup() returns trigger
    language plpgsql
    security definer
    set search_path = '' as
$$
declare
    user_name   text;
    picture_url text;
begin
    if new.raw_user_meta_data ->> 'name' is not null then
        user_name := new.raw_user_meta_data ->> 'name';
    end if;

    if user_name is null and new.email is not null then
        user_name := split_part(new.email, '@', 1);
    end if;

    if user_name is null then
        user_name := '';
    end if;

    if new.raw_user_meta_data ->> 'avatar_url' is not null then
        picture_url := new.raw_user_meta_data ->> 'avatar_url';
    else
        picture_url := null;
    end if;

    insert into public.accounts(id, name, picture_url, email, role, criticality_level)
    values (new.id,
            user_name,
            picture_url,
            new.email,
            'user',    -- default role
            'low'      -- default criticality per cahier des charges
           );

    return new;
end;
$$;
