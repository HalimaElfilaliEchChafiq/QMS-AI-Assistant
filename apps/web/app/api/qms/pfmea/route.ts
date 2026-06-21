/**
 * -------------------------------------------------------
 * API Route: PFMEA Generation (F3)
 * Étape 18 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/pfmea — Generate a PFMEA report
 * GET  /api/qms/pfmea — List user's PFMEA reports
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { createLLMProvider } from '@kit/llm/client';
import { HybridSearch } from '@kit/ingestion/hybrid-search';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// POST /api/qms/pfmea — Generate PFMEA
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
    const { process: processName, product, defects } = body as {
      process: string;
      product: string;
      defects: Array<{ description: string; severity?: string }>;
    };

    // Validation
    if (!processName?.trim()) {
      return NextResponse.json(
        { error: 'Process name is required' },
        { status: 400 },
      );
    }
    if (!product?.trim()) {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 },
      );
    }
    if (!defects || !Array.isArray(defects) || defects.length === 0) {
      return NextResponse.json(
        { error: 'At least one defect is required' },
        { status: 400 },
      );
    }

    // 1. Search for PFMEA templates in the user's authorized scope
    const search = new HybridSearch(supabase);
    const pfmeaQuery = `PFMEA AMDEC template ${processName} ${product} failure mode effects analysis`;
    const searchResults = await search.search(pfmeaQuery, undefined, {
      limit: 6,
      similarityThreshold: 0.15,
    });

    // 2. Anti-hallucination: if no relevant templates found, inform user
    if (searchResults.length === 0) {
      return NextResponse.json({
        success: false,
        noTemplates: true,
        message:
          'No relevant PFMEA templates or reference documents were found in your authorized document scope. Please ensure PFMEA templates have been ingested into the document base, or contact an administrator.',
      });
    }

    // 3. Build PFMEA-specific LLM prompt
    const templateContext = searchResults
      .map(
        (r, i) =>
          `### Template ${i + 1}: ${r.document.title} (${r.document.docType || 'N/A'})\n${r.content}`,
      )
      .join('\n\n');

    const defectsList = defects
      .map(
        (d, i) =>
          `${i + 1}. ${d.description}${d.severity ? ` (Severity: ${d.severity})` : ''}`,
      )
      .join('\n');

    const systemPrompt = `You are a QMS (Quality Management System) expert specializing in PFMEA (Process Failure Mode and Effects Analysis) / AMDEC reports.

## Task
Generate a comprehensive PFMEA report based on the provided context, templates, and defect information.

## Reference Templates from Document Base
${templateContext}

## Instructions
1. Use the templates above as structural references for the PFMEA format.
2. For each defect listed, analyze: potential failure mode, potential effect(s), severity (S), potential cause(s), occurrence (O), current controls, detection (D), and RPN (Risk Priority Number = S × O × D).
3. Include recommended actions for high-RPN items.
4. Format the output as a structured PFMEA table in Markdown.
5. Reference the source template(s) used at the end of the report.
6. Use a scale of 1-10 for S, O, and D ratings.

## IMPORTANT
Only use information from the provided templates and the user's input. Do NOT invent procedures or standards not present in the document base.`;

    const userPrompt = `Generate a PFMEA report for:

**Process:** ${processName}
**Product:** ${product}

**Known Defects:**
${defectsList}

Please generate a complete, structured PFMEA report.`;

    // 4. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 5. Save to database
    const adminClient = getSupabaseServerAdminClient();
    const templateIds = searchResults.map((r) => ({
      documentId: r.documentId,
      title: r.document.title,
    }));

    const { data: report, error: insertError } = await adminClient
      .from('pfmea_reports')
      .insert({
        user_id: user.id,
        process: processName.trim(),
        product: product.trim(),
        defects: JSON.stringify(defects),
        generated_content: llmResponse.content,
        template_ids: JSON.stringify(templateIds),
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: `Failed to save report: ${insertError.message}` },
        { status: 500 },
      );
    }

    // 6. Audit trail
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'pfmea_generation',
        query: `PFMEA: ${processName} / ${product}`,
      })
      .then(() => {});

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        process: processName,
        product,
        defects,
        generatedContent: llmResponse.content,
        templateIds,
        createdAt: report.created_at,
      },
    });
  } catch (err) {
    console.error('[API /api/qms/pfmea POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/qms/pfmea — List user's PFMEA reports
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

    // Check if admin (sees all) or regular user (sees own)
    const { data: account } = await adminClient
      .from('accounts')
      .select('role')
      .eq('id', user.id)
      .single();

    let query = adminClient
      .from('pfmea_reports')
      .select('id, process, product, defects, generated_content, template_ids, created_at')
      .order('created_at', { ascending: false });

    if (account?.role !== 'admin') {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reports: data || [] });
  } catch (err) {
    console.error('[API /api/qms/pfmea GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
