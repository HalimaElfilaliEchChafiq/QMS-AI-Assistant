/*
 * -------------------------------------------------------
 * Migration: Enable extensions for QMS RAG pipeline
 * Enables pgvector (vector similarity search) and pg_trgm (trigram matching)
 * Required by: Étape 1 — Environnement & extensions Postgres
 * -------------------------------------------------------
 */

-- Enable pgvector extension for vector embeddings and similarity search
create extension if not exists "vector" schema extensions;

-- Enable pg_trgm extension for trigram-based fuzzy text matching
create extension if not exists "pg_trgm" schema extensions;
