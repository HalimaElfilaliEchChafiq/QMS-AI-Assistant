'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  CheckCircle2,
  ChevronDown,
  Edit,
  FileUp,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type CriticalityLevel = 'low' | 'medium' | 'high';

interface Document {
  id: string;
  title: string;
  file_path: string;
  criticality: CriticalityLevel;
  doc_type: string | null;
  version: string | null;
  owner: string | null;
  site: string | null;
  language: string | null;
  source: string;
  ingested_at: string | null;
  updated_at: string | null;
}

// ─── Badge helpers ───────────────────────────────────────────────────────────
const criticalityColors: Record<CriticalityLevel, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

function CriticalityBadge({ level }: { level: CriticalityLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${criticalityColors[level]}`}
    >
      {level}
    </span>
  );
}

// ─── Upload Form ─────────────────────────────────────────────────────────────
function DocumentUploadForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [criticality, setCriticality] = useState<string>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!criticality) {
      setError('Criticality is required');
      return;
    }
    if (!file) {
      setError('Please select a file');
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set('file', file);
    formData.set('criticality', criticality);

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/documents', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Upload failed');
          return;
        }
        onSuccess();
      } catch {
        setError('Network error');
      }
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-lg">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Upload New Document</h3>
        <button
          onClick={onCancel}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* File upload */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            File <span className="text-rose-500">*</span>
          </label>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-muted/50">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {file ? file.name : 'Click to select PDF, DOCX, TXT, or MD'}
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {/* Criticality — REQUIRED, no default */}
        <div>
          <label className="mb-2 block text-sm font-medium">
            Criticality <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-3">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setCriticality(level)}
                className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider transition-all ${
                  criticality === level
                    ? `${criticalityColors[level]} border-current shadow-sm`
                    : 'border-border/40 text-muted-foreground hover:border-border'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Metadata fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Title</label>
            <input
              name="title"
              type="text"
              placeholder="Auto-detected from filename"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Document Type
            </label>
            <input
              name="doc_type"
              type="text"
              placeholder="e.g. Procédure, Instruction"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Version</label>
            <input
              name="version"
              type="text"
              defaultValue="v1"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Owner</label>
            <input
              name="owner"
              type="text"
              placeholder="Document owner"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Site</label>
            <input
              name="site"
              type="text"
              placeholder="Site name"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Language
            </label>
            <input
              name="language"
              type="text"
              defaultValue="fr"
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Upload & Ingest
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────
function DocumentEditDialog({
  doc,
  onClose,
  onSaved,
}: {
  doc: Document;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const body: Record<string, string> = {};
    for (const [key, val] of fd.entries()) {
      if (typeof val === 'string' && val.trim()) body[key] = val.trim();
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/documents/${doc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Update failed');
          return;
        }
        onSaved();
      } catch {
        setError('Network error');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Document Metadata</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Title</label>
            <input
              name="title"
              type="text"
              defaultValue={doc.title}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Criticality
            </label>
            <select
              name="criticality"
              defaultValue={doc.criticality}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            >
              <option value="low">LOW</option>
              <option value="medium">MEDIUM</option>
              <option value="high">HIGH</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Type</label>
              <input
                name="doc_type"
                type="text"
                defaultValue={doc.doc_type || ''}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Version
              </label>
              <input
                name="version"
                type="text"
                defaultValue={doc.version || ''}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Owner</label>
              <input
                name="owner"
                type="text"
                defaultValue={doc.owner || ''}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Site</label>
              <input
                name="site"
                type="text"
                defaultValue={doc.site || ''}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Language
            </label>
            <input
              name="language"
              type="text"
              defaultValue={doc.language || ''}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/documents');
      const data = await res.json();
      if (res.ok) {
        setDocuments(data.documents || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filtered = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.doc_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.owner || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Document Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload, manage and configure document metadata and criticality
            levels.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Upload form (toggleable) */}
      {showUpload && (
        <DocumentUploadForm
          onSuccess={() => {
            setShowUpload(false);
            fetchDocuments();
          }}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          {
            label: 'Total Documents',
            value: documents.length,
            color: 'text-foreground',
          },
          {
            label: 'LOW',
            value: documents.filter((d) => d.criticality === 'low').length,
            color: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'MEDIUM',
            value: documents.filter((d) => d.criticality === 'medium').length,
            color: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'HIGH',
            value: documents.filter((d) => d.criticality === 'high').length,
            color: 'text-rose-600 dark:text-rose-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/40 bg-card/50 p-4 shadow-sm backdrop-blur-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search documents by title, type, owner…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Documents table */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-3 text-left font-semibold">Title</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Criticality
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">
                  Type
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">
                  Version
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">
                  Owner
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold xl:table-cell">
                  Source
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold xl:table-cell">
                  Ingested
                </th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2">Loading documents…</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <FileUp className="mx-auto h-8 w-8 opacity-40" />
                    <p className="mt-2 font-medium">No documents found</p>
                    <p className="text-xs">
                      Upload your first document to get started.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-border/20 transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 font-medium">{doc.title}</td>
                    <td className="px-4 py-3">
                      <CriticalityBadge level={doc.criticality} />
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {doc.doc_type || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {doc.version || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {doc.owner || '—'}
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                        {doc.source}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground xl:table-cell">
                      {doc.ingested_at
                        ? new Date(doc.ingested_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingDoc(doc)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit dialog */}
      {editingDoc && (
        <DocumentEditDialog
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
}
