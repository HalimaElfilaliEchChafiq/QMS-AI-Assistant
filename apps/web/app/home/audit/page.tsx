'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  Plus,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChecklistItem {
  clause?: string;
  requirement?: string;
  question?: string;
  expectedEvidence?: string;
  sourceDocument?: string;
  rawContent?: string;
}

interface SourceDoc {
  documentId: string;
  title: string;
}

interface AuditChecklist {
  id: string;
  standard: string;
  process_scope: string;
  content: ChecklistItem[] | string;
  source_document_ids: SourceDoc[] | string;
  created_at: string;
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

interface AuditPlan {
  id: string;
  checklist_id: string;
  sampling_strategy: string;
  questions: PlanItem[] | string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseJson<T>(val: T | string): T {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val as T;
    }
  }
  return val;
}

const standardColors: Record<string, string> = {
  ISO9001:
    'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  IATF16949:
    'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30',
};

// ─── Checklist Generation Form ───────────────────────────────────────────────
function ChecklistForm({ onSuccess }: { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [standard, setStandard] = useState<string>('ISO9001');
  const [processScope, setProcessScope] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!processScope.trim()) {
      setError('Process scope is required');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/qms/audit/checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ standard, processScope: processScope.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Generation failed');
          return;
        }
        setProcessScope('');
        onSuccess();
      } catch {
        setError('Network error — please try again');
      }
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-lg">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-teal-600 shadow-md">
          <ClipboardCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Generate Audit Checklist</h3>
          <p className="text-xs text-muted-foreground">
            AI-powered checklist generation for ISO 9001 &amp; IATF 16949
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Standard selector */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Standard <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-3">
            {[
              { key: 'ISO9001', label: 'ISO 9001' },
              { key: 'IATF16949', label: 'IATF 16949' },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStandard(s.key)}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  standard === s.key
                    ? `${standardColors[s.key]} border-current shadow-sm`
                    : 'border-border/40 text-muted-foreground hover:border-border'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Process scope */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Process Scope <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="audit-process-scope"
            value={processScope}
            onChange={(e) => setProcessScope(e.target.value)}
            placeholder="e.g. Production control and delivery process for automotive parts manufacturing"
            rows={3}
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-600 to-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-sky-700 hover:to-teal-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4" />
            )}
            {isPending ? 'Generating…' : 'Generate Checklist'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Checklist Card ──────────────────────────────────────────────────────────
function ChecklistCard({
  checklist,
  onPlanGenerated,
}: {
  checklist: AuditChecklist;
  onPlanGenerated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generatingPlan, startPlanTransition] = useTransition();
  const [planError, setPlanError] = useState<string | null>(null);

  const items: ChecklistItem[] = parseJson(checklist.content) as ChecklistItem[];
  const sources: SourceDoc[] = parseJson(
    checklist.source_document_ids,
  ) as SourceDoc[];

  const handleGeneratePlan = () => {
    setPlanError(null);
    startPlanTransition(async () => {
      try {
        const res = await fetch('/api/qms/audit/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklistId: checklist.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPlanError(data.error || 'Plan generation failed');
          return;
        }
        onPlanGenerated();
      } catch {
        setPlanError('Network error');
      }
    });
  };

  const handleExport = async (format: 'docx' | 'pdf') => {
    try {
      const res = await fetch('/api/qms/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'checklist',
          id: checklist.id,
          format,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Checklist_${checklist.standard}_${checklist.process_scope.slice(0, 30)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const standardLabel =
    checklist.standard === 'ISO9001' ? 'ISO 9001' : 'IATF 16949';

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${standardColors[checklist.standard] || ''}`}
            >
              {standardLabel}
            </span>
            <h4 className="truncate font-semibold">
              {checklist.process_scope}
            </h4>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(checklist.created_at).toLocaleString()} ·{' '}
            {Array.isArray(items) ? items.length : '—'} item(s)
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan}
            title="Generate Audit Plan"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-500/10 dark:text-sky-400"
          >
            {generatingPlan ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            Plan
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {planError && (
        <div className="mx-5 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {planError}
        </div>
      )}

      {expanded && (
        <div className="border-t border-border/30 px-5 py-4">
          {/* Source docs */}
          {Array.isArray(sources) && sources.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Source Documents
              </p>
              <div className="flex flex-wrap gap-2">
                {sources.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400"
                  >
                    {s.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Checklist items table */}
          {Array.isArray(items) && items.length > 0 && !items[0]?.rawContent ? (
            <div className="overflow-x-auto rounded-lg border border-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/30">
                    <th className="px-3 py-2 text-left font-semibold">
                      Clause
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Requirement
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Question
                    </th>
                    <th className="hidden px-3 py-2 text-left font-semibold md:table-cell">
                      Expected Evidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/20 transition-colors hover:bg-muted/10"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-primary">
                        {item.clause || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {item.requirement || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {item.question || '—'}
                      </td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
                        {item.expectedEvidence || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
              {items[0]?.rawContent ||
                (typeof checklist.content === 'string'
                  ? checklist.content
                  : JSON.stringify(checklist.content, null, 2))}
            </div>
          )}

          {/* Export buttons */}
          <div className="mt-4 flex gap-2 border-t border-border/20 pt-3">
            <button
              onClick={() => handleExport('docx')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Word (.docx)
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────
function PlanCard({ plan }: { plan: AuditPlan }) {
  const [expanded, setExpanded] = useState(false);
  const items: PlanItem[] = parseJson(plan.questions) as PlanItem[];

  const priorityColor: Record<string, string> = {
    high: 'text-rose-600 dark:text-rose-400',
    medium: 'text-amber-600 dark:text-amber-400',
    low: 'text-emerald-600 dark:text-emerald-400',
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-semibold">
            Audit Plan — {plan.sampling_strategy}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(plan.created_at).toLocaleString()} ·{' '}
            {Array.isArray(items) ? items.length : '—'} area(s)
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border/30 px-5 py-4 space-y-3">
          {Array.isArray(items) && !items[0]?.rawContent ? (
            items.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/30 bg-muted/10 p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  {item.clause && (
                    <span className="font-mono text-xs font-semibold text-primary">
                      {item.clause}
                    </span>
                  )}
                  <span className="text-sm font-medium">
                    {item.area || '—'}
                  </span>
                  {item.priority && (
                    <span
                      className={`ml-auto text-xs font-semibold uppercase ${priorityColor[item.priority] || ''}`}
                    >
                      {item.priority}
                    </span>
                  )}
                </div>
                {item.questions && (
                  <ul className="ml-4 mt-1 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {item.questions.map((q, qi) => (
                      <li key={qi}>{q}</li>
                    ))}
                  </ul>
                )}
                {item.auditee && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <strong>Auditee:</strong> {item.auditee}
                  </p>
                )}
                {item.samplingNote && (
                  <p className="mt-0.5 text-xs text-muted-foreground italic">
                    {item.samplingNote}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
              {items[0]?.rawContent || JSON.stringify(plan.questions, null, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AuditPage() {
  const [checklists, setChecklists] = useState<AuditChecklist[]>([]);
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clRes, plRes] = await Promise.all([
        fetch('/api/qms/audit/checklist'),
        fetch('/api/qms/audit/plan'),
      ]);
      const clData = await clRes.json();
      const plData = await plRes.json();
      if (clRes.ok) setChecklists(clData.checklists || []);
      if (plRes.ok) setPlans(plData.plans || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Audit Planner
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate audit checklists for ISO 9001 and IATF 16949, then create
            detailed audit plans with interview questions.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Checklist
        </button>
      </div>

      {/* Form */}
      {showForm && <ChecklistForm onSuccess={fetchData} />}

      {/* Checklists */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Checklists
          {!loading && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({checklists.length})
            </span>
          )}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : checklists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-10 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-medium text-muted-foreground">
              No checklists generated yet
            </p>
            <p className="text-sm text-muted-foreground/70">
              Use the form above to create your first audit checklist.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {checklists.map((cl) => (
              <ChecklistCard
                key={cl.id}
                checklist={cl}
                onPlanGenerated={fetchData}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plans */}
      {plans.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Audit Plans
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({plans.length})
            </span>
          </h2>
          <div className="space-y-3">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
