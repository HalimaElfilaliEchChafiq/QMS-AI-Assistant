'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Insight {
  id: string;
  recurring_finding: string;
  linked_documents: string[] | string;
  recommendation: string;
  created_at: string;
}

interface AnalysisScope {
  checklists: number;
  plans: number;
  pfmeaReports: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseLinkedDocs(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Insight Card ────────────────────────────────────────────────────────────
function InsightCard({
  insight,
  index,
  onDelete,
}: {
  insight: Insight;
  index: number;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const linkedDocs = parseLinkedDocs(insight.linked_documents);

  const severityColor =
    index < 2
      ? 'from-rose-500/20 to-rose-500/5 border-rose-500/30'
      : index < 5
        ? 'from-amber-500/20 to-amber-500/5 border-amber-500/30'
        : 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';

  const severityIcon =
    index < 2 ? (
      <AlertTriangle className="h-4 w-4 text-rose-500" />
    ) : index < 5 ? (
      <TrendingUp className="h-4 w-4 text-amber-500" />
    ) : (
      <Lightbulb className="h-4 w-4 text-emerald-500" />
    );

  const handleDelete = async () => {
    if (!confirm('Delete this insight permanently?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/qms/insights?id=${insight.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDelete(insight.id);
      }
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br shadow-sm transition-all hover:shadow-md ${severityColor}`}
    >
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card/80 shadow-sm">
            {severityIcon}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold leading-snug">
              {insight.recurring_finding}
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(insight.created_at).toLocaleString()}
              {linkedDocs.length > 0 && (
                <span> · {linkedDocs.length} linked document(s)</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete insight"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        <div className="border-t border-border/20 px-5 py-4 space-y-4">
          {/* Linked Documents */}
          {linkedDocs.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Linked Documents / Areas
              </p>
              <div className="flex flex-wrap gap-2">
                {linkedDocs.map((doc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    <FileText className="h-3 w-3" />
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recommendation
            </p>
            <div className="rounded-lg border border-border/30 bg-card/60 px-4 py-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {insight.recommendation}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Cards ───────────────────────────────────────────────────────────
function ScopeCard({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`rounded-xl border ${color} bg-gradient-to-br p-4`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card/80 shadow-sm">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold">{count}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, startGeneration] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);
  const [lastScope, setLastScope] = useState<AnalysisScope | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/qms/insights');
      const data = await res.json();
      if (res.ok) {
        setInsights(data.insights || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleGenerate = () => {
    setGenError(null);
    startGeneration(async () => {
      try {
        const res = await fetch('/api/qms/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (data.success === false && data.message) {
          setGenError(data.message);
          return;
        }
        if (!res.ok) {
          setGenError(data.error || 'Generation failed');
          return;
        }

        if (data.analysisScope) {
          setLastScope(data.analysisScope);
        }

        fetchInsights();
      } catch {
        setGenError('Network error — please try again');
      }
    });
  };

  const handleDelete = (id: string) => {
    setInsights((prev) => prev.filter((ins) => ins.id !== id));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-md">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                AI Insights — Continuous Improvement
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                AI-powered analysis of audit data to identify recurring
                findings and improvement opportunities.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? 'Analyzing…' : 'Generate New Insights'}
        </button>
      </div>

      {/* Error message */}
      {genError && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-5 py-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{genError}</span>
        </div>
      )}

      {/* Last analysis scope */}
      {lastScope && (
        <div className="grid gap-3 sm:grid-cols-3">
          <ScopeCard
            label="Checklists Analyzed"
            count={lastScope.checklists}
            icon={<BarChart3 className="h-5 w-5 text-sky-500" />}
            color="from-sky-500/10 to-sky-500/5 border-sky-500/20"
          />
          <ScopeCard
            label="Audit Plans Analyzed"
            count={lastScope.plans}
            icon={<FileText className="h-5 w-5 text-teal-500" />}
            color="from-teal-500/10 to-teal-500/5 border-teal-500/20"
          />
          <ScopeCard
            label="PFMEA Reports Analyzed"
            count={lastScope.pfmeaReports}
            icon={<TrendingUp className="h-5 w-5 text-violet-500" />}
            color="from-violet-500/10 to-violet-500/5 border-violet-500/20"
          />
        </div>
      )}

      {/* Insights list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Improvement Insights
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({insights.length})
              </span>
            )}
          </h2>
          {!loading && insights.length > 0 && (
            <button
              onClick={fetchInsights}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : insights.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-16 text-center">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No insights generated yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Click &quot;Generate New Insights&quot; to analyze your audit data
              and identify improvement opportunities.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                index={i}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
