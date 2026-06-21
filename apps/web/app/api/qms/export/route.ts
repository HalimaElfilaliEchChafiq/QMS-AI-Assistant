/**
 * -------------------------------------------------------
 * API Route: Document Export — Word (.docx) & PDF
 * Étape 21 — Phase 5: Fonctions Métier QMS
 *
 * POST /api/qms/export
 *   body: { type: 'pfmea' | 'checklist' | 'plan', id: string, format: 'docx' | 'pdf' }
 *
 * Generates and streams a .docx or .pdf file from stored
 * PFMEA reports, audit checklists, or audit plans.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx';
import { jsPDF } from 'jspdf';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExportType = 'pfmea' | 'checklist' | 'plan';
type ExportFormat = 'docx' | 'pdf';

interface ChecklistItem {
  clause?: string;
  requirement?: string;
  question?: string;
  expectedEvidence?: string;
  sourceDocument?: string;
  rawContent?: string;
}

interface PlanItem {
  clause?: string;
  area?: string;
  questions?: string[];
  auditee?: string;
  documentsToReview?: string[];
  samplingNote?: string;
  priority?: string;
  rawContent?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseJsonSafe<T>(val: unknown): T {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val as T;
    }
  }
  return val as T;
}

function sanitizeText(text: unknown): string {
  if (typeof text === 'string') return text;
  if (text == null) return '—';
  return String(text);
}

// ---------------------------------------------------------------------------
// DOCX generators
// ---------------------------------------------------------------------------
function createDocxParagraph(text: string, options?: {
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
  bold?: boolean;
  spacing?: { before?: number; after?: number };
}): Paragraph {
  return new Paragraph({
    heading: options?.heading,
    spacing: options?.spacing ?? { after: 100 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        size: options?.heading ? undefined : 22,
      }),
    ],
  });
}

function generatePFMEADocx(report: Record<string, unknown>): Document {
  const templates = parseJsonSafe<Array<{ title: string }>>(report.template_ids);
  const defects = parseJsonSafe<Array<{ description: string; severity?: string }>>(report.defects);

  const children: Paragraph[] = [
    createDocxParagraph('PFMEA Report', { heading: HeadingLevel.HEADING_1 }),
    createDocxParagraph(`Process: ${sanitizeText(report.process)}`),
    createDocxParagraph(`Product: ${sanitizeText(report.product)}`),
    createDocxParagraph(`Generated: ${new Date(report.created_at as string).toLocaleString()}`),
    createDocxParagraph(''),
  ];

  // Defects list
  if (Array.isArray(defects) && defects.length > 0) {
    children.push(createDocxParagraph('Known Defects', { heading: HeadingLevel.HEADING_2 }));
    defects.forEach((d, i) => {
      children.push(
        createDocxParagraph(
          `${i + 1}. ${d.description}${d.severity ? ` (Severity: ${d.severity})` : ''}`,
        ),
      );
    });
    children.push(createDocxParagraph(''));
  }

  // Generated content
  children.push(createDocxParagraph('Analysis', { heading: HeadingLevel.HEADING_2 }));
  const contentLines = sanitizeText(report.generated_content).split('\n');
  contentLines.forEach((line) => {
    children.push(createDocxParagraph(line));
  });

  // Template references
  if (Array.isArray(templates) && templates.length > 0) {
    children.push(createDocxParagraph(''));
    children.push(createDocxParagraph('Referenced Templates', { heading: HeadingLevel.HEADING_2 }));
    templates.forEach((t) => {
      children.push(createDocxParagraph(`• ${t.title}`));
    });
  }

  return new Document({
    sections: [{ children }],
  });
}

function generateChecklistDocx(checklist: Record<string, unknown>): Document {
  const items = parseJsonSafe<ChecklistItem[]>(checklist.content);
  const sources = parseJsonSafe<Array<{ title: string }>>(checklist.source_document_ids);
  const standardLabel = checklist.standard === 'ISO9001' ? 'ISO 9001' : 'IATF 16949';

  const children: Paragraph[] = [
    createDocxParagraph(`Audit Checklist — ${standardLabel}`, { heading: HeadingLevel.HEADING_1 }),
    createDocxParagraph(`Process Scope: ${sanitizeText(checklist.process_scope)}`),
    createDocxParagraph(`Generated: ${new Date(checklist.created_at as string).toLocaleString()}`),
    createDocxParagraph(''),
  ];

  // Checklist as table if structured
  if (Array.isArray(items) && items.length > 0 && !items[0]?.rawContent) {
    const headerRow = new TableRow({
      tableHeader: true,
      children: ['Clause', 'Requirement', 'Question', 'Expected Evidence', 'Status'].map(
        (h) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          }),
      ),
    });

    const dataRows = items.map(
      (item) =>
        new TableRow({
          children: [
            item.clause || '—',
            item.requirement || '—',
            item.question || '—',
            item.expectedEvidence || '—',
            '☐',
          ].map(
            (val) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })],
                width: { size: 20, type: WidthType.PERCENTAGE },
              }),
          ),
        }),
    );

    children.push(
      new Paragraph({ text: '' }),
    );

    const table = new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    children.push(createDocxParagraph('Checklist Items', { heading: HeadingLevel.HEADING_2 }));

    return new Document({
      sections: [{
        children: [
          ...children,
          table,
          ...(Array.isArray(sources) && sources.length > 0
            ? [
                createDocxParagraph(''),
                createDocxParagraph('Source Documents', { heading: HeadingLevel.HEADING_2 }),
                ...sources.map((s) => createDocxParagraph(`• ${s.title}`)),
              ]
            : []),
        ],
      }],
    });
  } else {
    // Fallback: raw content
    const rawContent = items?.[0]?.rawContent || (typeof checklist.content === 'string' ? checklist.content as string : JSON.stringify(checklist.content, null, 2));
    rawContent.split('\n').forEach((line: string) => {
      children.push(createDocxParagraph(line));
    });

    return new Document({
      sections: [{ children }],
    });
  }
}

function generatePlanDocx(plan: Record<string, unknown>): Document {
  const items = parseJsonSafe<PlanItem[]>(plan.questions);

  const children: Paragraph[] = [
    createDocxParagraph('Audit Plan', { heading: HeadingLevel.HEADING_1 }),
    createDocxParagraph(`Sampling Strategy: ${sanitizeText(plan.sampling_strategy)}`),
    createDocxParagraph(`Generated: ${new Date(plan.created_at as string).toLocaleString()}`),
    createDocxParagraph(''),
  ];

  if (Array.isArray(items) && !items[0]?.rawContent) {
    items.forEach((item, i) => {
      children.push(
        createDocxParagraph(
          `${item.clause ? `[${item.clause}] ` : ''}${item.area || `Area ${i + 1}`}${item.priority ? ` — Priority: ${item.priority.toUpperCase()}` : ''}`,
          { heading: HeadingLevel.HEADING_2 },
        ),
      );

      if (item.questions && item.questions.length > 0) {
        children.push(createDocxParagraph('Questions:', { bold: true }));
        item.questions.forEach((q, qi) => {
          children.push(createDocxParagraph(`  ${qi + 1}. ${q}`));
        });
      }

      if (item.auditee) {
        children.push(createDocxParagraph(`Auditee: ${item.auditee}`));
      }

      if (item.documentsToReview && item.documentsToReview.length > 0) {
        children.push(createDocxParagraph(`Documents to review: ${item.documentsToReview.join(', ')}`));
      }

      if (item.samplingNote) {
        children.push(createDocxParagraph(`Sampling: ${item.samplingNote}`));
      }

      children.push(createDocxParagraph(''));
    });
  } else {
    const rawContent = items?.[0]?.rawContent || JSON.stringify(plan.questions, null, 2);
    rawContent.split('\n').forEach((line: string) => {
      children.push(createDocxParagraph(line));
    });
  }

  return new Document({
    sections: [{ children }],
  });
}

// ---------------------------------------------------------------------------
// PDF generators
// ---------------------------------------------------------------------------
function addPdfTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 14, y);
  return y + 10;
}

function addPdfSubtitle(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 14, y);
  return y + 8;
}

function addPdfText(doc: jsPDF, text: string, y: number, options?: { indent?: number }): number {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const indent = options?.indent ?? 14;
  const maxWidth = doc.internal.pageSize.getWidth() - indent - 14;
  const lines = doc.splitTextToSize(text, maxWidth);
  const lineHeight = 5;

  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, indent, y);
    y += lineHeight;
  }
  return y;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number = 30): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 20;
  }
  return y;
}

function generatePFMEAPdf(report: Record<string, unknown>): jsPDF {
  const doc = new jsPDF();
  const templates = parseJsonSafe<Array<{ title: string }>>(report.template_ids);
  const defects = parseJsonSafe<Array<{ description: string; severity?: string }>>(report.defects);

  let y = 20;
  y = addPdfTitle(doc, 'PFMEA Report', y);
  y = addPdfText(doc, `Process: ${sanitizeText(report.process)}`, y);
  y = addPdfText(doc, `Product: ${sanitizeText(report.product)}`, y);
  y = addPdfText(doc, `Generated: ${new Date(report.created_at as string).toLocaleString()}`, y);
  y += 5;

  if (Array.isArray(defects) && defects.length > 0) {
    y = checkPageBreak(doc, y);
    y = addPdfSubtitle(doc, 'Known Defects', y);
    defects.forEach((d, i) => {
      y = addPdfText(
        doc,
        `${i + 1}. ${d.description}${d.severity ? ` (Severity: ${d.severity})` : ''}`,
        y,
        { indent: 18 },
      );
    });
    y += 3;
  }

  y = checkPageBreak(doc, y);
  y = addPdfSubtitle(doc, 'Analysis', y);
  const contentLines = sanitizeText(report.generated_content).split('\n');
  for (const line of contentLines) {
    y = addPdfText(doc, line, y);
  }

  if (Array.isArray(templates) && templates.length > 0) {
    y += 5;
    y = checkPageBreak(doc, y);
    y = addPdfSubtitle(doc, 'Referenced Templates', y);
    templates.forEach((t) => {
      y = addPdfText(doc, `• ${t.title}`, y, { indent: 18 });
    });
  }

  return doc;
}

function generateChecklistPdf(checklist: Record<string, unknown>): jsPDF {
  const doc = new jsPDF();
  const items = parseJsonSafe<ChecklistItem[]>(checklist.content);
  const sources = parseJsonSafe<Array<{ title: string }>>(checklist.source_document_ids);
  const standardLabel = checklist.standard === 'ISO9001' ? 'ISO 9001' : 'IATF 16949';

  let y = 20;
  y = addPdfTitle(doc, `Audit Checklist — ${standardLabel}`, y);
  y = addPdfText(doc, `Process Scope: ${sanitizeText(checklist.process_scope)}`, y);
  y = addPdfText(doc, `Generated: ${new Date(checklist.created_at as string).toLocaleString()}`, y);
  y += 5;

  if (Array.isArray(items) && items.length > 0) {
    if (!items[0]?.rawContent) {
      // Structured items as numbered list
      y = addPdfSubtitle(doc, 'Checklist Items', y);
      items.forEach((item, i) => {
        y = checkPageBreak(doc, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${i + 1}. [${item.clause || '—'}] ${item.requirement || ''}`, 14, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        if (item.question) {
          y = addPdfText(doc, `Q: ${item.question}`, y, { indent: 18 });
        }
        if (item.expectedEvidence) {
          y = addPdfText(doc, `Evidence: ${item.expectedEvidence}`, y, { indent: 18 });
        }
        y = addPdfText(doc, 'Status: ☐ Conforming  ☐ Non-conforming  ☐ N/A', y, { indent: 18 });
        y += 3;
      });
    } else {
      // Raw content fallback
      const rawContent = items[0].rawContent || JSON.stringify(checklist.content, null, 2);
      y = addPdfText(doc, rawContent, y);
    }
  }

  if (Array.isArray(sources) && sources.length > 0) {
    y += 5;
    y = checkPageBreak(doc, y);
    y = addPdfSubtitle(doc, 'Source Documents', y);
    sources.forEach((s) => {
      y = addPdfText(doc, `• ${s.title}`, y, { indent: 18 });
    });
  }

  return doc;
}

function generatePlanPdf(plan: Record<string, unknown>): jsPDF {
  const doc = new jsPDF();
  const items = parseJsonSafe<PlanItem[]>(plan.questions);

  let y = 20;
  y = addPdfTitle(doc, 'Audit Plan', y);
  y = addPdfText(doc, `Sampling Strategy: ${sanitizeText(plan.sampling_strategy)}`, y);
  y = addPdfText(doc, `Generated: ${new Date(plan.created_at as string).toLocaleString()}`, y);
  y += 5;

  if (Array.isArray(items) && !items[0]?.rawContent) {
    items.forEach((item, i) => {
      y = checkPageBreak(doc, y);
      y = addPdfSubtitle(
        doc,
        `${item.clause ? `[${item.clause}] ` : ''}${item.area || `Area ${i + 1}`}${item.priority ? ` — ${item.priority.toUpperCase()}` : ''}`,
        y,
      );

      if (item.questions && item.questions.length > 0) {
        y = addPdfText(doc, 'Questions:', y);
        item.questions.forEach((q, qi) => {
          y = addPdfText(doc, `  ${qi + 1}. ${q}`, y, { indent: 22 });
        });
      }

      if (item.auditee) {
        y = addPdfText(doc, `Auditee: ${item.auditee}`, y, { indent: 18 });
      }

      if (item.documentsToReview && item.documentsToReview.length > 0) {
        y = addPdfText(doc, `Documents: ${item.documentsToReview.join(', ')}`, y, { indent: 18 });
      }

      if (item.samplingNote) {
        y = addPdfText(doc, `Sampling: ${item.samplingNote}`, y, { indent: 18 });
      }

      y += 3;
    });
  } else {
    const rawContent = items?.[0]?.rawContent || JSON.stringify(plan.questions, null, 2);
    y = addPdfText(doc, rawContent, y);
  }

  return doc;
}

// ---------------------------------------------------------------------------
// POST /api/qms/export
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
    const { type, id, format } = body as {
      type: ExportType;
      id: string;
      format: ExportFormat;
    };

    // Validate inputs
    if (!type || !['pfmea', 'checklist', 'plan'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be pfmea, checklist, or plan' },
        { status: 400 },
      );
    }
    if (!id?.trim()) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 },
      );
    }
    if (!format || !['docx', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: 'Format must be docx or pdf' },
        { status: 400 },
      );
    }

    const adminClient = getSupabaseServerAdminClient();

    // Check user role for ownership verification
    const { data: account } = await adminClient
      .from('accounts')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = account?.role === 'admin';

    // ─── Fetch the record ───────────────────────────────────────────────
    let record: Record<string, unknown> | null = null;
    let filename = 'export';

    if (type === 'pfmea') {
      const { data, error } = await adminClient
        .from('pfmea_reports')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'PFMEA report not found' }, { status: 404 });
      }
      if (!isAdmin && data.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      record = data;
      filename = `PFMEA_${sanitizeText(data.process)}_${sanitizeText(data.product)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    } else if (type === 'checklist') {
      const { data, error } = await adminClient
        .from('audit_checklists')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Checklist not found' }, { status: 404 });
      }
      if (!isAdmin && data.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      record = data;
      filename = `Checklist_${data.standard}_${sanitizeText(data.process_scope)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    } else if (type === 'plan') {
      const { data, error } = await adminClient
        .from('audit_plans')
        .select('*, audit_checklists!inner(user_id)')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Audit plan not found' }, { status: 404 });
      }
      const checklistOwner = (data.audit_checklists as Record<string, unknown>)?.user_id;
      if (!isAdmin && checklistOwner !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      record = data;
      filename = `AuditPlan_${sanitizeText(data.sampling_strategy)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    }

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // ─── Generate file ──────────────────────────────────────────────────
    let fileBuffer: Buffer;
    let contentType: string;

    if (format === 'docx') {
      let docxDoc: Document;

      if (type === 'pfmea') {
        docxDoc = generatePFMEADocx(record);
      } else if (type === 'checklist') {
        docxDoc = generateChecklistDocx(record);
      } else {
        docxDoc = generatePlanDocx(record);
      }

      fileBuffer = Buffer.from(await Packer.toBuffer(docxDoc));
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      // PDF
      let pdfDoc: jsPDF;

      if (type === 'pfmea') {
        pdfDoc = generatePFMEAPdf(record);
      } else if (type === 'checklist') {
        pdfDoc = generateChecklistPdf(record);
      } else {
        pdfDoc = generatePlanPdf(record);
      }

      const pdfArrayBuffer = pdfDoc.output('arraybuffer');
      fileBuffer = Buffer.from(pdfArrayBuffer);
      contentType = 'application/pdf';
    }

    // ─── Audit trail ────────────────────────────────────────────────────
    adminClient
      .from('audit_trail')
      .insert({
        user_id: user.id,
        action: 'export_document',
        query: `Export ${type} (${format}): ${id}`,
      })
      .then(() => {});

    // ─── Return file ────────────────────────────────────────────────────
    return new NextResponse(fileBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}.${format}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (err) {
    console.error('[API /api/qms/export POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
