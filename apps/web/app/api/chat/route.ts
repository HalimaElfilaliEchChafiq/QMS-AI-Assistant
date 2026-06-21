/**
 * -------------------------------------------------------
 * API Route: Chat — Main Endpoint
 * Étape 13 — Phase 4: Cœur du Chat IA
 *
 * POST /api/chat
 *
 * Flow:
 *   1. Authenticate user
 *   2. Create or retrieve session
 *   3. Run hybrid search (RLS-filtered by user criticality)
 *   4. Check anti-hallucination guard
 *   5. Calculate confidence score
 *   6. Build prompt (procedural + context + memory)
 *   7. Call LLM
 *   8. Persist message + sources + confidence
 *   9. Extract semantic memory (fire-and-forget)
 *  10. Log to audit_trail
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  calculateConfidence,
  type ConfidenceLevel,
  passesHallucinationGuard,
} from '@kit/llm/confidence';
import { createLLMProvider } from '@kit/llm/client';
import {
  extractAndStoreSemanticFacts,
  getEpisodicMemory,
  getSemanticMemory,
} from '@kit/llm/memory';
import {
  buildSystemPrompt,
  type LanguageMode,
  type SourceForMessage,
} from '@kit/llm/prompts';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { HybridSearch } from '@kit/ingestion/hybrid-search';

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();



    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user found' },
        { status: 401 },
      );
    }

    // 2. Parse request
    const body = await request.json();
    const {
      message,
      sessionId: existingSessionId,
      languageMode = 'source_language',
      attachmentContext,
      attachmentName,
    } = body as {
      message: string;
      sessionId?: string;
      languageMode?: LanguageMode;
      /** Phase 6: extracted text from an uploaded file (ephemeral context) */
      attachmentContext?: string;
      /** Phase 6: name of the attached file */
      attachmentName?: string;
    };

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();

    // 3. Get or create session
    let sessionId = existingSessionId;
    if (!sessionId) {
      const sessionTitle =
        message.length > 60 ? message.slice(0, 57) + '…' : message;
      const { data: newSession, error: sessionError } = await adminClient
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: sessionTitle,
          language_mode: languageMode,
        })
        .select('id')
        .single();

      if (sessionError) {
        return NextResponse.json(
          { error: `Session creation failed: ${sessionError.message}` },
          { status: 500 },
        );
      }
      sessionId = newSession.id;
    } else {
      // Update language mode if changed
      await adminClient
        .from('chat_sessions')
        .update({ language_mode: languageMode, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
    }

    // 4. Persist user message
    await adminClient.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
    });

    // 5. Hybrid search (RLS-filtered via user's Supabase client)
    const search = new HybridSearch(supabase);
    // Fetch a larger pool of candidates to ensure variety
    const searchResultsRaw = await search.search(message, undefined, {
      limit: 30,
      similarityThreshold: 0.15,
    });

    // Diversify sources: limit maximum chunks per document
    const chunksPerDoc = new Map<string, number>();
    const searchResults = [];
    const MAX_CHUNKS_PER_DOC = 3;
    const MAX_TOTAL_CHUNKS = 12;

    for (const r of searchResultsRaw) {
      const docCount = chunksPerDoc.get(r.documentId) || 0;
      if (docCount < MAX_CHUNKS_PER_DOC) {
        searchResults.push(r);
        chunksPerDoc.set(r.documentId, docCount + 1);
      }
      if (searchResults.length >= MAX_TOTAL_CHUNKS) break;
    }

    // 6. Anti-hallucination guard
    const similarities = searchResults.map((r) => r.similarity);
    const guardPassed = passesHallucinationGuard(similarities);

    // 7. Confidence scoring
    const distinctDocs = new Set(searchResults.map((r) => r.documentId));
    const docDates = searchResults.map(
      (r) => r.document.version || null,
    );
    const confidenceResult = guardPassed
      ? calculateConfidence({
        similarities,
        distinctDocuments: distinctDocs.size,
        documentDates: docDates,
      })
      : { level: 'low' as ConfidenceLevel, score: 0, details: { avgSimilarity: 0, coverageScore: 0, freshnessScore: 0 } };

    // 8. Gather memory
    const [episodicMemory, semanticFacts] = await Promise.all([
      getEpisodicMemory(adminClient, sessionId),
      getSemanticMemory(adminClient, user.id),
    ]);

    // 9. Build system prompt
    const { systemPrompt, sources } = buildSystemPrompt({
      userQuery: message,
      searchResults,
      episodicMemory,
      semanticFacts,
      languageMode,
      passedGuard: guardPassed,
    });

    // 9b. [Phase 6] Inject attachment context if present
    let finalSystemPrompt = systemPrompt;
    if (attachmentContext && attachmentContext.trim()) {
      const attachLabel = attachmentName
        ? `Attached file: ${attachmentName}`
        : 'Attached file';
      finalSystemPrompt += `\n\n## ${attachLabel} (Temporary Context — NOT from the permanent document base)\nThe user has attached a file for contextual analysis. Use the following extracted content to help answer their question, but clearly distinguish it from the permanent QMS document sources:\n\n${attachmentContext.slice(0, 8000)}`;
    }

    // 10. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: message },
    ]);

    // 11. Persist assistant response
    const { data: assistantMsg } = await adminClient
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'assistant',
        content: llmResponse.content,
        sources: JSON.stringify(sources),
        confidence_level: confidenceResult.level,
      })
      .select('id, created_at')
      .single();

    // 12. Audit trail (fire-and-forget)
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'chat_query',
        query: message.slice(0, 500),
      })
      .then(() => { });

    // 13. Semantic memory extraction (fire-and-forget)
    extractAndStoreSemanticFacts(
      adminClient,
      user.id,
      message,
      llmResponse.content,
    ).catch(() => { });

    // 14. Return response
    return NextResponse.json({
      sessionId,
      message: {
        id: assistantMsg?.id,
        role: 'assistant',
        content: llmResponse.content,
        sources,
        confidenceLevel: confidenceResult.level,
        confidenceScore: confidenceResult.score,
        confidenceDetails: confidenceResult.details,
        createdAt: assistantMsg?.created_at,
      },
    });
  } catch (err) {
    console.error('[API /api/chat] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
