/**
 * -------------------------------------------------------
 * API Route: Document Verify Mode (F3)
 * Étape 19 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/verify
 *
 * Upload a document temporarily, extract its text, and
 * audit it against QMS rules found via hybrid search.
 * The uploaded document is NOT ingested permanently.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { createLLMProvider } from '@kit/llm/client';
import { HybridSearch } from '@kit/ingestion/hybrid-search';
import { extractTextFromBuffer } from '@kit/ingestion/text-extractor';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

// ---------------------------------------------------------------------------
// POST /api/qms/verify
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

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: 'A document file is required' },
        { status: 400 },
      );
    }

    // Validate extension
    const fileName = file.name;
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported file type. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // 1. Extract text from the uploaded file (in-memory, NOT persisted)
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { text: documentText } = await extractTextFromBuffer(
      fileBuffer,
      fileName,
    );

    if (!documentText.trim()) {
      return NextResponse.json(
        { error: 'Could not extract text from the uploaded document' },
        { status: 400 },
      );
    }

    // 2. Search for relevant QMS rules/procedures in the user's authorized scope
    const search = new HybridSearch(supabase);
    const searchQuery = `QMS quality management procedure rules requirements compliance ${documentText.slice(0, 200)}`;
    const searchResults = await search.search(searchQuery, undefined, {
      limit: 8,
      similarityThreshold: 0.15,
    });

    // 3. Build audit-focused prompt
    const referenceContext =
      searchResults.length > 0
        ? searchResults
            .map(
              (r, i) =>
                `### Reference ${i + 1}: ${r.document.title} (${r.document.docType || 'N/A'})\n${r.content}`,
            )
            .join('\n\n')
        : 'No QMS reference documents were found in your authorized scope.';

    const systemPrompt = `You are a QMS (Quality Management System) compliance auditor.

## Task
Audit the uploaded document against the QMS rules and procedures found in the reference document base. Identify:
1. **Missing fields or sections** that should be present according to QMS standards
2. **Inconsistencies** between the document and QMS procedures
3. **Non-conformities** or deviations from established rules
4. **Recommendations** for bringing the document into compliance

## QMS Reference Documents
${referenceContext}

## Output Format
Provide a structured audit report with the following sections:

### 📋 Compliance Summary
A brief overall assessment (Compliant / Partially Compliant / Non-Compliant)

### ⚠️ Findings
For each finding, include:
- **Finding #N**: [Title]
- **Type**: Missing Field | Inconsistency | Non-Conformity
- **Severity**: High | Medium | Low
- **Description**: What was found
- **Reference**: Which QMS procedure/rule applies
- **Recommendation**: What action to take

### ✅ Compliant Areas
List areas where the document meets QMS requirements.

## IMPORTANT
- Only compare against the provided reference documents. Do NOT invent rules not present in the references.
- If no reference documents were found, state that verification cannot be fully performed without a QMS reference base.`;

    const userPrompt = `Please audit the following document for QMS compliance:

**Document name:** ${fileName}

**Document content:**
${documentText.slice(0, 8000)}${documentText.length > 8000 ? '\n\n[... document truncated for analysis ...]' : ''}`;

    // 4. Call LLM
    const llm = await createLLMProvider();
    const llmResponse = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // 5. Audit trail (document NOT stored)
    const adminClient = getSupabaseServerAdminClient();
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'verify_document',
        query: `Verify: ${fileName}`,
      })
      .then(() => {});

    // 6. Return findings (document is NOT persisted)
    const referencedDocs = searchResults.map((r) => ({
      documentId: r.documentId,
      title: r.document.title,
      docType: r.document.docType,
      criticality: r.document.criticality,
    }));

    return NextResponse.json({
      success: true,
      fileName,
      analysis: llmResponse.content,
      referencedDocuments: referencedDocs,
      documentPersisted: false,
    });
  } catch (err) {
    console.error('[API /api/qms/verify POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
