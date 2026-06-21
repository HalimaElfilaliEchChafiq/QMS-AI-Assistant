'use client';

import { useEffect, useRef, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import type { LanguageMode } from './types';

/**
 * -------------------------------------------------------
 * Language Selector Component
 * Étape 17 — Phase 4: Sélecteur de comportement linguistique
 *
 * Dropdown allowing the user to switch the AI's language
 * behavior between three modes. Closes on outside click.
 * -------------------------------------------------------
 */

const languageModes: {
  value: LanguageMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'english_only',
    label: '🇬🇧 English Only',
    description: 'All responses in English',
  },
  {
    value: 'source_language',
    label: '📄 Source Language',
    description: 'Respond in document language',
  },
  {
    value: 'french_with_english_citations',
    label: '🇫🇷 French + EN Citations',
    description: 'French text, English quotes',
  },
];

export function LanguageSelector({
  value,
  onChange,
}: {
  value: LanguageMode;
  onChange: (v: LanguageMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current =
    languageModes.find((m) => m.value === value) || languageModes[1];

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {current!.label}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-xl border border-border/60 bg-card p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          {languageModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => {
                onChange(mode.value);
                setOpen(false);
              }}
              className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted ${
                value === mode.value ? 'bg-primary/10' : ''
              }`}
            >
              <span className="text-sm font-medium">{mode.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {mode.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
