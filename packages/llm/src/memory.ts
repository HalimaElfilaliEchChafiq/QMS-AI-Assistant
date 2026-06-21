/**
 * -------------------------------------------------------
 * Cognitive Memory Module
 * Étape 15 — Phase 4: Mémoire cognitive
 * Ref: section 7 du cahier des charges
 *
 * Three types of memory:
 *   1. Episodic  — last K messages from current session
 *   2. Semantic  — persistent facts extracted from conversations
 *   3. Procedural — constant system rules (from procedural-rules.ts)
 * -------------------------------------------------------
 */

import { type SupabaseClient } from '@supabase/supabase-js';

import { type ChatMessage, createLLMProvider } from './client';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const MEMORY_CONFIG = {
  /** Number of recent messages to include as episodic memory */
  episodicMessageCount: 10,

  /** Maximum number of semantic facts to inject per prompt */
  maxSemanticFacts: 15,

  /** Categories for semantic facts */
  categories: [
    'project',
    'preference',
    'role',
    'context',
    'general',
  ] as const,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EpisodicMemory {
  messages: ChatMessage[];
}

export interface SemanticFact {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Episodic Memory — last K messages from session
// ---------------------------------------------------------------------------

/**
 * Retrieve the last K messages from the current session.
 * Uses service_role or user-context client (RLS will enforce ownership).
 */
export async function getEpisodicMemory(
  supabase: SupabaseClient,
  sessionId: string,
  limit?: number,
): Promise<EpisodicMemory> {
  const k = limit ?? MEMORY_CONFIG.episodicMessageCount;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(k);

  if (error) {
    console.error('[Memory:Episodic] Error fetching messages:', error);
    return { messages: [] };
  }

  // Reverse to get chronological order
  const messages: ChatMessage[] = (data ?? [])
    .reverse()
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  return { messages };
}

// ---------------------------------------------------------------------------
// Semantic Memory — persistent user facts
// ---------------------------------------------------------------------------

/**
 * Retrieve all semantic facts for a user.
 */
export async function getSemanticMemory(
  supabase: SupabaseClient,
  userId: string,
  limit?: number,
): Promise<SemanticFact[]> {
  const maxFacts = limit ?? MEMORY_CONFIG.maxSemanticFacts;

  const { data, error } = await supabase
    .from('memory_semantic')
    .select('id, fact, category, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(maxFacts);

  if (error) {
    console.error('[Memory:Semantic] Error fetching facts:', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fact: row.fact,
    category: row.category,
    createdAt: row.created_at,
  }));
}

/**
 * Extract key facts from a conversation exchange and store them.
 * Called asynchronously after each assistant response.
 */
export async function extractAndStoreSemanticFacts(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  try {
    const llm = await createLLMProvider();

    const extractionPrompt = `Analyze this conversation exchange and extract any KEY FACTS about the user that should be remembered for future conversations. Focus on:
- Projects they are working on
- Their role or department
- Preferences (document types, sites, languages)
- Recurring topics of interest
- Specific equipment, processes, or products they mention

Return ONLY a JSON array of objects with "fact" and "category" fields.
Categories: "project", "preference", "role", "context", "general"

If no memorable facts are found, return an empty array: []

USER MESSAGE:
${userMessage}

ASSISTANT RESPONSE:
${assistantResponse}

EXTRACTED FACTS (JSON array only):`;

    const result = await llm.chat(
      [{ role: 'user', content: extractionPrompt }],
      { temperature: 0.1, maxTokens: 500 },
    );

    // Parse the JSON response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts = JSON.parse(jsonMatch[0]) as Array<{
      fact: string;
      category: string;
    }>;

    if (!Array.isArray(facts) || facts.length === 0) return;

    // Store new facts (avoid duplicates by checking existing facts)
    const { data: existing } = await supabase
      .from('memory_semantic')
      .select('fact')
      .eq('user_id', userId);

    const existingFacts = new Set(
      (existing ?? []).map((e) => e.fact.toLowerCase()),
    );

    const newFacts = facts
      .filter(
        (f) =>
          f.fact &&
          f.category &&
          !existingFacts.has(f.fact.toLowerCase()),
      )
      .map((f) => ({
        user_id: userId,
        fact: f.fact,
        category: f.category,
      }));

    if (newFacts.length > 0) {
      await supabase.from('memory_semantic').insert(newFacts);
    }
  } catch (err) {
    // Non-critical: log and continue
    console.error('[Memory:Semantic] Extraction failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Format memory for prompt injection
// ---------------------------------------------------------------------------

/**
 * Format episodic memory as a prompt block.
 */
export function formatEpisodicBlock(memory: EpisodicMemory): string {
  if (memory.messages.length === 0) return '';

  const lines = memory.messages.map(
    (m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`,
  );

  return [
    '## Recent Conversation History (Episodic Memory)',
    ...lines,
  ].join('\n');
}

/**
 * Format semantic facts as a prompt block.
 */
export function formatSemanticBlock(facts: SemanticFact[]): string {
  if (facts.length === 0) return '';

  const lines = facts.map(
    (f) => `- [${f.category}] ${f.fact}`,
  );

  return [
    '## Known Facts About This User (Semantic Memory)',
    'Use these facts to provide more personalized and relevant responses:',
    ...lines,
  ].join('\n');
}
