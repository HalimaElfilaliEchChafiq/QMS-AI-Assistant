'use client';

import { MessageSquare } from 'lucide-react';

/**
 * -------------------------------------------------------
 * Chat Empty State Component
 * Phase 4 — Welcome screen with suggested questions
 *
 * Shown when no messages exist in the current session.
 * Clicking a suggestion pre-fills the input.
 * -------------------------------------------------------
 */

const SUGGESTIONS = [
  'What are the main procedures for ISO 9001 compliance?',
  'Show me the PFMEA templates available',
  'What are the quality control steps for assembly?',
  'Summarize the audit findings from the last review',
];

export function ChatEmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <div className="rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 p-6">
        <MessageSquare className="h-10 w-10 text-violet-500" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">
          QMS AI Assistant
        </p>
        <p className="mt-1 max-w-sm text-sm">
          Ask questions about your quality documents. Responses include
          source citations and confidence scoring.
        </p>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggestionClick(q)}
            className="rounded-lg border border-border/40 px-3 py-2 text-left text-xs transition-all hover:bg-muted hover:border-border/60 hover:shadow-sm"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
