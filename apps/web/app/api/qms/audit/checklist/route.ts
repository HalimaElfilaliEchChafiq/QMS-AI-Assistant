/**
 * -------------------------------------------------------
 * API Route: Audit Checklist Generation (F4)
 * Étape 20 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/audit/checklist — Generate checklist
 * GET  /api/qms/audit/checklist — List user's checklists
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { createLLMProvider } from '@kit/llm/client';
import { HybridSearch } from '@kit/ingestion/hybrid-search';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const VALID_STANDARDS = ['ISO9001', 'IATF16949'] as const;

// ---------------------------------------------------------------------------
// POST /api/qms/audit/checklist
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { standard, processScope } = body as {
      standard: string;
      processScope: string;
    };

    if (
      !standard ||
      !VALID_STANDARDS.includes(standard as (typeof VALID_STANDARDS)[number])
    ) {
      return NextResponse.json(
        { error: 'Standard must be ISO9001 or IATF16949' },
        { status: 400 },
      );
    }
    if (!processScope?.trim()) {
      return NextResponse.json(
        { error: 'Process scope is required' },
        { status: 400 },
      );
    }

    // 1. Search for relevant QMS documents
    const search = new HybridSearch(supabase);
    const standardLabel =
      standard === 'ISO9001' ? 'ISO 9001' : 'IATF 16949';
    const searchQuery = `${standardLabel} audit checklist ${processScope} quality management`;
    const searchResults = await search.search(searchQuery, undefined, {
      limit: 8,
      similarityThreshold: 0.15,
    });

    const referenceContext =
      searchResults.length > 0
        ? searchResults
            .map(
              (r, i) =>
                `### Reference ${i + 1}: ${r.document.title}\n${r.content}`,
            )
            .join('\n\n')
        : 'No specific reference documents found in your authorized scope.';

    // 2. Build prompt
    const systemPrompt = `You are a certified ${standardLabel} lead auditor and QMS expert.

## Task
Generate a comprehensive audit checklist for ${standardLabel} conformity assessment.

## Reference Documents from QMS Base
${referenceContext}

## Instructions
1. Create a structured checklist organized by clause/section of ${standardLabel}.
2. For each checklist item, include:
   - Clause reference (e.g., "4.1", "7.1.5")
   - Requirement description
   - Audit question
   - Expected evidence
   - Status field: ☐ Conforming / ☐ Non-conforming / ☐ N/A
3. Focus on the specified process scope.
4. Reference any relevant source documents from the QMS base.

## Output as JSON array
Return the checklist as a JSON array with this structure:
\`\`\`json
[
  {
    "clause": "4.1",
    "requirement": "Understanding the organization and its context",
    "question": "How does the organization determine external and internal issues?",
    "expectedEvidence": "SWOT analysis, context analysis documents",
    "sourceDocument": "Referenced document title if applicable"
  }
]
\`\`\`

## IMPORTANT
Only use information from the reference documents when available. For standard clauses, you may reference the ${standardLabel} standard structure directly.`;

    const userPrompt = `Generate an audit checklist for:

**Standard:** ${standardLabel}
**Process scope:** ${processScope}

Please provide a complete, structured audit checklist.`;

    // 3. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 4. Try to parse checklist items from JSON
    let checklistContent: unknown[];
    try {
      const jsonMatch = llmResponse.content.match(
        /\[[\s\S]*\]/,
      );
      checklistContent = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : [{ rawContent: llmResponse.content }];
    } catch {
      checklistContent = [{ rawContent: llmResponse.content }];
    }

    // 5. Save to database
    const adminClient = getSupabaseServerAdminClient();
    const sourceDocIds = searchResults.map((r) => ({
      documentId: r.documentId,
      title: r.document.title,
    }));

    const { data: checklist, error: insertError } = await adminClient
      .from('audit_checklists')
      .insert({
        user_id: user.id,
        standard,
        process_scope: processScope.trim(),
        content: JSON.stringify(checklistContent),
        source_document_ids: JSON.stringify(sourceDocIds),
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save checklist: ${insertError.message}` },
        { status: 500 },
      );
    }

    // 6. Audit trail
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'checklist_generation',
        query: `Checklist: ${standardLabel} — ${processScope}`,
      })
      .then(() => {});

    return NextResponse.json({
      success: true,
      checklist: {
        id: checklist.id,
        standard,
        processScope,
        content: checklistContent,
        sourceDocumentIds: sourceDocIds,
        createdAt: checklist.created_at,
      },
    });
  } catch (err) {
    console.error('[API /api/qms/audit/checklist POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/qms/audit/checklist — List checklists
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = getSupabaseServerAdminClient();

    const { data: account } = await adminClient
      .from('accounts')
      .select('role')
      .eq('id', user.id)
      .single();

    let query = adminClient
      .from('audit_checklists')
      .select(
        'id, standard, process_scope, content, source_document_ids, created_at',
      )
      .order('created_at', { ascending: false });

    if (account?.role !== 'admin') {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checklists: data || [] });
  } catch (err) {
    console.error('[API /api/qms/audit/checklist GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
