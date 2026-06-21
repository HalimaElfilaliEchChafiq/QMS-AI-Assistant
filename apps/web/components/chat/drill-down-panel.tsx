'use client';

import { useState } from 'react';

import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
} from 'lucide-react';

import type { Source } from './types';

/**
 * -------------------------------------------------------
 * F1 Drill-Down Panel Component
 * Étape 14 — Phase 4: Synthèse + "Voir l'extrait"
 *
 * Displays a collapsible source reference. On expand, lazily
 * loads the full excerpt from /api/chat/drill-down with
 * surrounding context chunks.
 * -------------------------------------------------------
 */

export function DrillDownPanel({ source }: { source: Source }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<{
    excerpt: { content: string };
    document: { title: string; filePath: string; version: string | null };
    context?: { before: string | null; after: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);

    if (detail) return; // Already loaded

    setLoading(true);
    try {
      const res = await fetch('/api/chat/drill-down', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: source.documentId,
          chunkIndex: source.chunkIndex,
        }),
      });
      if (res.ok) {
        setDetail(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const critColor =
    source.criticality === 'high'
      ? 'text-rose-600 dark:text-rose-400'
      : source.criticality === 'medium'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 transition-all hover:border-border/50">
      <button
        onClick={handleExpand}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-xs font-medium">
          {source.documentTitle}
        </span>
        <span
          className={`text-[10px] font-semibold uppercase ${critColor}`}
        >
          {source.criticality}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {(source.similarity * 100).toFixed(0)}%
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/20 px-3 py-2.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading excerpt…
            </div>
          ) : (
            <div className="space-y-2">
              {/* Context before (if available) */}
              {detail?.context?.before && (
                <div className="rounded-md bg-muted/30 p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    Context (before)
                  </p>
                  <p className="text-xs leading-relaxed text-foreground/60 italic">
                    {detail.context.before.slice(0, 200)}…
                  </p>
                </div>
              )}

              {/* Main excerpt */}
              <div className="rounded-md bg-background/80 p-3 ring-1 ring-border/20">
                <p className="text-xs leading-relaxed text-foreground/90">
                  {detail?.excerpt?.content || source.excerpt}
                </p>
              </div>

              {/* Context after (if available) */}
              {detail?.context?.after && (
                <div className="rounded-md bg-muted/30 p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    Context (after)
                  </p>
                  <p className="text-xs leading-relaxed text-foreground/60 italic">
                    {detail.context.after.slice(0, 200)}…
                  </p>
                </div>
              )}

              {/* Document metadata */}
              {detail?.document && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/10">
                  {detail.document.version && (
                    <span>Version: {detail.document.version}</span>
                  )}
                  <span className="truncate">
                    Path: {detail.document.filePath}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
