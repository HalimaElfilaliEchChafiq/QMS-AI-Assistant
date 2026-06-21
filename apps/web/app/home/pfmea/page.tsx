'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Defect {
  description: string;
  severity?: string;
}

interface TemplateRef {
  documentId: string;
  title: string;
}

interface PFMEAReport {
  id: string;
  process: string;
  product: string;
  defects: Defect[];
  generated_content: string;
  template_ids: TemplateRef[];
  created_at: string;
}

// ─── PFMEA Form Component ────────────────────────────────────────────────────
function PFMEAForm({ onSuccess }: { onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [processName, setProcessName] = useState('');
  const [product, setProduct] = useState('');
  const [defects, setDefects] = useState<Defect[]>([
    { description: '', severity: '' },
  ]);

  const addDefect = () =>
    setDefects((prev) => [...prev, { description: '', severity: '' }]);

  const removeDefect = (index: number) =>
    setDefects((prev) => prev.filter((_, i) => i !== index));

  const updateDefect = (
    index: number,
    field: keyof Defect,
    value: string,
  ) =>
    setDefects((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!processName.trim()) {
      setError('Process name is required');
      return;
    }
    if (!product.trim()) {
      setError('Product name is required');
      return;
    }

    const validDefects = defects.filter((d) => d.description.trim());
    if (validDefects.length === 0) {
      setError('At least one defect description is required');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/qms/pfmea', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            process: processName.trim(),
            product: product.trim(),
            defects: validDefects,
          }),
        });
        const data = await res.json();

        if (data.noTemplates) {
          setError(data.message);
          return;
        }
        if (!res.ok) {
          setError(data.error || 'Generation failed');
          return;
        }

        setProcessName('');
        setProduct('');
        setDefects([{ description: '', severity: '' }]);
        onSuccess();
      } catch {
        setError('Network error — please try again');
      }
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-lg">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Generate PFMEA Report</h3>
          <p className="text-xs text-muted-foreground">
            AI-powered failure mode analysis from your document base
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Process <span className="text-rose-500">*</span>
            </label>
            <input
              id="pfmea-process"
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              placeholder="e.g. Assembly Line A"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Product <span className="text-rose-500">*</span>
            </label>
            <input
              id="pfmea-product"
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. Brake Caliper Unit"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Defects list */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">
              Known Defects <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={addDefect}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Defect
            </button>
          </div>
          <div className="space-y-3">
            {defects.map((defect, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    value={defect.description}
                    onChange={(e) =>
                      updateDefect(idx, 'description', e.target.value)
                    }
                    placeholder={`Defect ${idx + 1} description`}
                    className="flex-[2] rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    value={defect.severity || ''}
                    onChange={(e) =>
                      updateDefect(idx, 'severity', e.target.value)
                    }
                    placeholder="Severity (1-10)"
                    className="w-32 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                {defects.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDefect(idx)}
                    className="mt-1.5 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {isPending ? 'Generating…' : 'Generate PFMEA'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Report Card Component ───────────────────────────────────────────────────
function ReportCard({ report }: { report: PFMEAReport }) {
  const [expanded, setExpanded] = useState(false);

  const templates: TemplateRef[] = (() => {
    try {
      const raw = report.template_ids;
      if (typeof raw === 'string') return JSON.parse(raw);
      if (Array.isArray(raw)) return raw;
      return [];
    } catch {
      return [];
    }
  })();

  const handleExport = async (format: 'docx' | 'pdf') => {
    try {
      const res = await fetch('/api/qms/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pfmea', id: report.id, format }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PFMEA_${report.process}_${report.product}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card/80 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-semibold">
            {report.process} — {report.product}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleString()} · {templates.length}{' '}
            template(s) referenced
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleExport('docx')}
            title="Export Word"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
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
      {expanded && (
        <div className="border-t border-border/30 px-5 py-4">
          {/* Templates referenced */}
          {templates.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Templates Referenced
              </p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400"
                  >
                    {t.title}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Report content */}
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {report.generated_content}
          </div>
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

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PFMEAPage() {
  const [reports, setReports] = useState<PFMEAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/qms/pfmea');
      const data = await res.json();
      if (res.ok) setReports(data.reports || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            PFMEA Generator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate Process Failure Mode and Effects Analysis reports powered
            by your QMS document base.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New PFMEA
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <PFMEAForm
          onSuccess={() => {
            fetchReports();
          }}
        />
      )}

      {/* Reports list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Generated Reports
          {!loading && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({reports.length})
            </span>
          )}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-12 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-medium text-muted-foreground">
              No PFMEA reports yet
            </p>
            <p className="text-sm text-muted-foreground/70">
              Use the form above to generate your first report.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
