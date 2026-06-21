'use client';

import { useState, useTransition } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ReferencedDoc {
  documentId: string;
  title: string;
  docType: string | null;
  criticality: string;
}

interface VerifyResult {
  fileName: string;
  analysis: string;
  referencedDocuments: ReferencedDoc[];
}

// ─── Criticality badge ──────────────────────────────────────────────────────
const critColors: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function VerifyPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError('Please select a document to verify');
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('file', file);

        const res = await fetch('/api/qms/verify', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Verification failed');
          return;
        }

        setResult(data);
      } catch {
        setError('Network error — please try again');
      }
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Verify Mode
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a document to audit it for QMS compliance. The file is analyzed
          temporarily and{' '}
          <strong className="text-foreground">
            never stored in the permanent document base
          </strong>
          .
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
            <FileSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Upload Document for Audit</h3>
            <p className="text-xs text-muted-foreground">
              Supported formats: PDF, DOCX, TXT, MD
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border/60 bg-muted/20 px-6 py-10 transition-colors hover:border-primary/50 hover:bg-muted/40">
            {file ? (
              <>
                <FileText className="h-10 w-10 text-primary" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB — Click to change
                </span>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground/50" />
                <span className="text-sm text-muted-foreground">
                  Click to select a file to verify
                </span>
              </>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
              }}
            />
          </label>

          {/* Session-only notice */}
          <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-4 py-2.5 text-xs text-sky-700 dark:text-sky-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              This document is used for <strong>one-time analysis only</strong>.
              It will not be added to the permanent document database.
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending || !file}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-amber-700 hover:to-orange-700 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
              {isPending ? 'Analyzing…' : 'Run Compliance Audit'}
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            <h3 className="text-lg font-semibold">
              Audit Results — {result.fileName}
            </h3>
          </div>

          {/* Referenced documents */}
          {result.referencedDocuments.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                QMS References Used ({result.referencedDocuments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {result.referencedDocuments.map((doc, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${critColors[doc.criticality] || 'bg-muted text-foreground border-border'}`}
                  >
                    {doc.title}
                    {doc.docType && (
                      <span className="ml-1 opacity-60">· {doc.docType}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Analysis */}
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {result.analysis}
          </div>
        </div>
      )}
    </div>
  );
}
