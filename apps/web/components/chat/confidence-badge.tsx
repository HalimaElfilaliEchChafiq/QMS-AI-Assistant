'use client';

import { Shield } from 'lucide-react';

/**
 * -------------------------------------------------------
 * Confidence Badge Component
 * Étape 16 — Phase 4: Score de confiance UI
 *
 * Displays a colored badge (high/medium/low) with Shield icon
 * to indicate the reliability level of the AI response.
 * -------------------------------------------------------
 */

const confidenceStyles: Record<string, { bg: string; label: string }> = {
  high: {
    bg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    label: 'High Confidence',
  },
  medium: {
    bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    label: 'Medium Confidence',
  },
  low: {
    bg: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
    label: 'Low Confidence',
  },
};

export function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const style = confidenceStyles[level] || confidenceStyles.low;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style!.bg}`}
    >
      <Shield className="h-2.5 w-2.5" />
      {style!.label}
    </span>
  );
}
