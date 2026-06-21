/**
 * -------------------------------------------------------
 * Chat Component Types
 * Phase 4 — Shared types for all chat UI components
 * -------------------------------------------------------
 */

export type LanguageMode =
  | 'english_only'
  | 'source_language'
  | 'french_with_english_citations';

export interface Source {
  documentId: string;
  documentTitle: string;
  criticality: string;
  excerpt: string;
  similarity: number;
  chunkIndex: number;
  docType: string | null;
  version: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: Source[];
  confidenceLevel: string | null;
  createdAt: string;
  /** Name of the attached file (if any) — display only */
  attachmentName?: string;
  /** Extracted text from the attached file — used as extra context */
  attachmentContext?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  language_mode: string;
  created_at: string;
  updated_at: string;
}
