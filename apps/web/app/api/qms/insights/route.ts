/**
 * -------------------------------------------------------
 * API Route: Continuous Improvement Insights (Extension)
 * Étape 22 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/insights     — Generate AI insights from audit data
 * GET  /api/qms/insights     — List existing insights
 * DELETE /api/qms/insights   — Delete an insight (admin only)
 *
 * Analyses audit checklists and plans to identify recurring
 * findings, linked documents, and improvement recommendations.
 * Access restricted to admin role.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { createLLMProvider } from '@kit/llm/client';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function verifyAdmin(userId: string): Promise<boolean> {
  const adminClient = getSupabaseServerAdminClient();
  const { data } = await adminClient
    .from('accounts')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

interface InsightItem {
  recurringFinding: string;
  linkedDocuments: string[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// POST /api/qms/insights — Generate new AI insights
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

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = getSupabaseServerAdminClient();

    // 1. Gather all audit data
    const [checklistsRes, plansRes, pfmeaRes] = await Promise.all([
      adminClient
        .from('audit_checklists')
        .select('id, standard, process_scope, content, source_document_ids, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      adminClient
        .from('audit_plans')
        .select('id, checklist_id, sampling_strategy, questions, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      adminClient
        .from('pfmea_reports')
        .select('id, process, product, defects, generated_content, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const checklists = checklistsRes.data || [];
    const plans = plansRes.data || [];
    const pfmeaReports = pfmeaRes.data || [];

    if (checklists.length === 0 && plans.length === 0 && pfmeaReports.length === 0) {
      return NextResponse.json({
        success: false,
        message:
          'No audit data available for analysis. Generate some audit checklists, plans, or PFMEA reports first.',
      });
    }

    // 2. Build analysis context
    const checklistSummary = checklists
      .map(
        (cl) =>
          `[${cl.standard}] ${cl.process_scope} (${new Date(cl.created_at || '').toLocaleDateString()}) — ${typeof cl.content === 'string' ? cl.content.slice(0, 300) : JSON.stringify(cl.content).slice(0, 300)}`,
      )
      .join('\n\n');

    const planSummary = plans
      .map(
        (p) =>
          `Strategy: ${p.sampling_strategy} (${new Date(p.created_at || '').toLocaleDateString()}) — ${typeof p.questions === 'string' ? p.questions.slice(0, 300) : JSON.stringify(p.questions).slice(0, 300)}`,
      )
      .join('\n\n');

    const pfmeaSummary = pfmeaReports
      .map(
        (r) =>
          `Process: ${r.process}, Product: ${r.product} (${new Date(r.created_at || '').toLocaleDateString()}) — Defects: ${typeof r.defects === 'string' ? r.defects.slice(0, 200) : JSON.stringify(r.defects).slice(0, 200)}`,
      )
      .join('\n\n');

    // 3. Build LLM prompt for aggregate analysis
    const systemPrompt = `You are a QMS (Quality Management System) continuous improvement analyst.

## Task
Analyze the provided audit data (checklists, audit plans, and PFMEA reports) to identify:
1. **Recurring findings** — issues or themes that appear across multiple audits or reports
2. **Linked documents** — documents frequently associated with non-conformities or findings
3. **Improvement recommendations** — actionable suggestions for harmonization, simplification, or strengthening of the QMS documentation

## Data Summary

### Audit Checklists (${checklists.length} records)
${checklistSummary || 'None available'}

### Audit Plans (${plans.length} records)
${planSummary || 'None available'}

### PFMEA Reports (${pfmeaReports.length} records)
${pfmeaSummary || 'None available'}

## Output as JSON array
Return your analysis as a JSON array of insight objects:
\`\`\`json
[
  {
    "recurringFinding": "Description of the recurring finding or pattern",
    "linkedDocuments": ["Document or area name 1", "Document or area name 2"],
    "recommendation": "Specific, actionable recommendation for improvement"
  }
]
\`\`\`

## Instructions
- Identify 3-8 key insights from the data.
- Focus on patterns that repeat across multiple records.
- Be specific — cite process names, standards, or defect types when possible.
- Recommendations should be concrete and implementable.
- Do NOT invent findings not supported by the data above.`;

    const userPrompt = `Please analyze the audit data above and generate continuous improvement insights for our QMS.`;

    // 4. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 5. Parse insights
    let insights: InsightItem[];
    try {
      const jsonMatch = llmResponse.content.match(/\[[\s\S]*\]/);
      insights = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : [
            {
              recurringFinding: 'Analysis completed',
              linkedDocuments: [],
              recommendation: llmResponse.content,
            },
          ];
    } catch {
      insights = [
        {
          recurringFinding: 'Analysis completed',
          linkedDocuments: [],
          recommendation: llmResponse.content,
        },
      ];
    }

    // 6. Save insights to database
    const insightsToInsert = insights.map((insight) => ({
      recurring_finding: insight.recurringFinding,
      linked_documents: JSON.stringify(insight.linkedDocuments || []),
      recommendation: insight.recommendation,
    }));

    const { data: savedInsights, error: insertError } = await adminClient
      .from('continuous_improvement_insights')
      .insert(insightsToInsert)
      .select('id, recurring_finding, linked_documents, recommendation, created_at');

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save insights: ${insertError.message}` },
        { status: 500 },
      );
    }

    // 7. Audit trail
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'insights_generation',
        query: `Generated ${insights.length} improvement insights`,
      })
      .then(() => {});

    return NextResponse.json({
      success: true,
      insights: savedInsights,
      analysisScope: {
        checklists: checklists.length,
        plans: plans.length,
        pfmeaReports: pfmeaReports.length,
      },
    });
  } catch (err) {
    console.error('[API /api/qms/insights POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/qms/insights — List all insights (admin only)
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

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = getSupabaseServerAdminClient();
    const { data, error } = await adminClient
      .from('continuous_improvement_insights')
      .select('id, recurring_finding, linked_documents, recommendation, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ insights: data || [] });
  } catch (err) {
    console.error('[API /api/qms/insights GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/qms/insights — Delete an insight (admin only)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const insightId = searchParams.get('id');

    if (!insightId) {
      return NextResponse.json({ error: 'Insight ID is required' }, { status: 400 });
    }

    const adminClient = getSupabaseServerAdminClient();
    const { error } = await adminClient
      .from('continuous_improvement_insights')
      .delete()
      .eq('id', insightId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit trail
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'insight_deleted',
        query: `Deleted insight: ${insightId}`,
      })
      .then(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /api/qms/insights DELETE] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
