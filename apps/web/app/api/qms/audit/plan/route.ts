/**
 * -------------------------------------------------------
 * API Route: Audit Plan Generation (F4)
 * Étape 20 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/audit/plan — Generate audit plan from a checklist
 * GET  /api/qms/audit/plan — List user's audit plans
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { createLLMProvider } from '@kit/llm/client';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// POST /api/qms/audit/plan
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
    const { checklistId, samplingStrategy } = body as {
      checklistId: string;
      samplingStrategy?: string;
    };

    if (!checklistId?.trim()) {
      return NextResponse.json(
        { error: 'Checklist ID is required' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();

    // 1. Load the checklist (verify ownership)
    const { data: checklist, error: clError } = await adminClient
      .from('audit_checklists')
      .select('id, user_id, standard, process_scope, content')
      .eq('id', checklistId)
      .single();

    if (clError || !checklist) {
      return NextResponse.json(
        { error: 'Checklist not found' },
        { status: 404 },
      );
    }

    // Verify ownership (unless admin)
    const { data: account } = await adminClient
      .from('accounts')
      .select('role')
      .eq('id', user.id)
      .single();

    if (checklist.user_id !== user.id && account?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 },
      );
    }

    // 2. Build prompt for audit plan
    const standardLabel =
      checklist.standard === 'ISO9001' ? 'ISO 9001' : 'IATF 16949';
    const strategy = samplingStrategy || 'risk-based';

    const checklistJson =
      typeof checklist.content === 'string'
        ? checklist.content
        : JSON.stringify(checklist.content, null, 2);

    const systemPrompt = `You are a certified ${standardLabel} lead auditor.

## Task
Generate a detailed audit plan based on the provided checklist.

## Checklist
${checklistJson}

## Instructions
1. For each checklist item, generate 1-3 specific interview questions.
2. Apply the "${strategy}" sampling strategy to determine which areas to prioritize.
3. Include:
   - Audit schedule / order of activities
   - Auditee roles to interview
   - Documents to review
   - Sampling approach for each area
4. Format the output as a JSON array of audit plan items.

## Output as JSON array
\`\`\`json
[
  {
    "clause": "4.1",
    "area": "Context of the organization",
    "questions": ["Question 1", "Question 2"],
    "auditee": "Quality Manager",
    "documentsToReview": ["Quality manual", "SWOT analysis"],
    "samplingNote": "Full review — high risk area",
    "priority": "high"
  }
]
\`\`\``;

    const userPrompt = `Generate an audit plan for:
**Standard:** ${standardLabel}
**Process scope:** ${checklist.process_scope}
**Sampling strategy:** ${strategy}`;

    // 3. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 4. Parse questions
    let questions: unknown[];
    try {
      const jsonMatch = llmResponse.content.match(/\[[\s\S]*\]/);
      questions = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : [{ rawContent: llmResponse.content }];
    } catch {
      questions = [{ rawContent: llmResponse.content }];
    }

    // 5. Save to database
    const { data: plan, error: insertError } = await adminClient
      .from('audit_plans')
      .insert({
        checklist_id: checklistId,
        sampling_strategy: strategy,
        questions: JSON.stringify(questions),
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save plan: ${insertError.message}` },
        { status: 500 },
      );
    }

    // 6. Audit trail
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'audit_plan_generation',
        query: `Plan: ${standardLabel} — ${checklist.process_scope}`,
      })
      .then(() => {});

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        checklistId,
        samplingStrategy: strategy,
        questions,
        createdAt: plan.created_at,
      },
    });
  } catch (err) {
    console.error('[API /api/qms/audit/plan POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/qms/audit/plan — List plans
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

    // Get plans via checklist ownership
    const { data, error } = await adminClient
      .from('audit_plans')
      .select(
        `id, checklist_id, sampling_strategy, questions, created_at,
         audit_checklists!inner(user_id, standard, process_scope)`,
      )
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by ownership if not admin
    const filtered =
      account?.role === 'admin'
        ? data
        : (data || []).filter((p: Record<string, unknown>) => {
            const cl = p.audit_checklists as Record<string, unknown> | null;
            return cl?.user_id === user.id;
          });

    return NextResponse.json({ plans: filtered || [] });
  } catch (err) {
    console.error('[API /api/qms/audit/plan GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
