'use client';

import React from 'react';

import type { ChatMessage } from './types';
import { ConfidenceBadge } from './confidence-badge';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@kit/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import { BookOpen } from 'lucide-react';

/**
 * -------------------------------------------------------
 * Message Bubble Component
 * Étapes 14-16 — Phase 4
 *
 * Renders a single chat message with:
 *   - Avatar (user / AI gradient)
 *   - Markdown-rendered content (lightweight parser)
 *   - Confidence badge (assistant only)
 *   - F1 drill-down source panels (assistant only)
 *   - Timestamp
 * -------------------------------------------------------
 */

// ── Lightweight Markdown Renderer ────────────────────────────────────────────
// Parses a subset of Markdown without any external dependency.
// Supports: **bold**, *italic*, `code`, ```code blocks```, bullet lists,
//           [links](url), --- separators, and ### headings.

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLanguage = '';
  let blockIndex = 0;

  const flushCodeBlock = () => {
    if (codeLines.length > 0) {
      elements.push(
        <div
          key={`code-${blockIndex++}`}
          className="my-2 overflow-x-auto rounded-lg bg-zinc-900 dark:bg-zinc-950 p-3"
        >
          {codeLanguage && (
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {codeLanguage}
            </span>
          )}
          <pre className="text-[13px] leading-relaxed text-zinc-200">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      codeLines = [];
      codeLanguage = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(
        <hr
          key={`hr-${i}`}
          className="my-3 border-border/30"
        />,
      );
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const headingText = headingMatch[2]!;
      const className =
        level === 1
          ? 'text-base font-bold mt-3 mb-1'
          : level === 2
            ? 'text-sm font-bold mt-2.5 mb-1'
            : 'text-sm font-semibold mt-2 mb-0.5';
      elements.push(
        <div key={`h-${i}`} className={className}>
          {renderInline(headingText)}
        </div>,
      );
      continue;
    }

    // Bullet list items
    const bulletMatch = line.match(/^(\s*)([-*]|\*\*)\s+(.+)$/);
    if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1]?.length || 0) / 2);
      elements.push(
        <div
          key={`li-${i}`}
          className="flex gap-2 py-0.5"
          style={{ paddingLeft: `${indent * 16 + 4}px` }}
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
          <span className="flex-1">{renderInline(bulletMatch[3]!)}</span>
        </div>,
      );
      continue;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      const indent = Math.floor((numberedMatch[1]?.length || 0) / 2);
      elements.push(
        <div
          key={`ol-${i}`}
          className="flex gap-2 py-0.5"
          style={{ paddingLeft: `${indent * 16 + 4}px` }}
        >
          <span className="shrink-0 text-muted-foreground font-medium">
            {line.match(/\d+/)?.[0]}.
          </span>
          <span className="flex-1">{renderInline(numberedMatch[2]!)}</span>
        </div>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="py-0.5">
        {renderInline(line)}
      </p>,
    );
  }

  // Flush any remaining code block
  if (inCodeBlock) {
    flushCodeBlock();
  }

  return elements;
}

/**
 * Parse inline Markdown: **bold**, *italic*, `code`, [link](url), [Source: ...]
 */
function renderInline(text: string): React.ReactNode {
  // Pattern order matters — longer patterns first
  const pattern =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {match[4]}
        </em>,
      );
    } else if (match[5]) {
      // `code`
      parts.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono text-foreground/80"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      // [text](url)
      parts.push(
        <a
          key={`a-${keyIdx++}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
        >
          {match[8]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ── Message Bubble ───────────────────────────────────────────────────────────

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const sources = msg.sources || [];
  
  // Cleanly split markdown for assistant responses
  let cleaned = msg.content;
  if (!isUser) {
    // 1. Nettoyage du JSON (et des étoiles éventuelles qui le précédaient)
    cleaned = cleaned.split('```json:sources')[0]?.trim() || cleaned;
    // Supprime agressivement "DETAILED_SOURCES" et tout ce qui suit
    cleaned = cleaned.replace(/(?:\*\*)?\s*DETAILED_SOURCES[\s\S]*$/i, '').trim();
    // Supprime "SOURCES [" ou "SOURCES\n```json\n[" et tout ce qui suit
    cleaned = cleaned.replace(/(?:\*\*)?\s*SOURCES\s*(?:```[a-z]*\s*)?\[[\s\S]*$/i, '').trim();
    // Au cas où le LLM omet le crochet "[" mais affiche juste "SOURCES" à la fin
    cleaned = cleaned.replace(/(?:\*\*)?\s*SOURCES\s*$/i, '').trim();
    // Au cas où il resterait des étoiles seules à la toute fin du message
    cleaned = cleaned.replace(/\*\*$/, '').trim();
    
    // 1.5 Nettoyage des étoiles orphelines en début de ligne (si le LLM n'a pas fermé son gras)
    cleaned = cleaned.replace(/^(\*\*\s*)([^*\n]+)$/gm, '$2');
  }

  // 2. Séparation Synthèse / Détails
  let summaryText = cleaned;
  let detailText = '';

  if (!isUser && cleaned.includes('---DETAILS---')) {
    const parts = cleaned.split('---DETAILS---');
    summaryText = parts[0]!.trim();
    detailText = parts.slice(1).join('\n\n').trim();
  } else if (!isUser && cleaned.length > 0) {
    // Fallback if LLM failed to output the separator
    const paragraphs = cleaned.split(/\n\s*\n/);
    let currentLen = 0;
    let i = 0;
    summaryText = '';
    for (; i < paragraphs.length; i++) {
      summaryText += paragraphs[i] + '\n\n';
      currentLen += paragraphs[i]!.length;
      if (currentLen > 250 || paragraphs[i]!.trim().startsWith('#')) {
        i++;
        break;
      }
    }
    for (; i < paragraphs.length; i++) {
      detailText += paragraphs[i] + '\n\n';
    }
  }

  const summary = isUser ? <div className="whitespace-pre-wrap">{cleaned}</div> : <div className="chat-markdown">{renderMarkdown(summaryText.trim())}</div>;
  const details = detailText.trim().length > 0 ? <div className="chat-markdown">{renderMarkdown(detailText.trim())}</div> : null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Content */}
      <div
        className={`flex max-w-[75%] flex-col gap-1.5 ${isUser ? 'items-end' : ''}`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border border-border/30 bg-card shadow-sm'
          }`}
        >
          {isUser ? (
            summary
          ) : (
            <div className="flex flex-col gap-1 w-full">
              {summary}
              
              {details && (
                <Accordion type="single" collapsible className="mt-2 w-full">
                  <AccordionItem value="details" className="border-b-0">
                    <AccordionTrigger className="text-xs font-semibold py-2 text-primary hover:no-underline">
                      Plus de détails techniques
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 text-sm text-foreground/90 bg-muted/20 p-3 rounded-lg mt-1">
                      {details}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </div>

        {/* Confidence badge + sources (assistant only) */}
        {!isUser && (
          <div className="flex flex-col gap-2">
            {msg.confidenceLevel && (
              <ConfidenceBadge level={msg.confidenceLevel} />
            )}

            {/* Sources (Popover drill-down) */}
            {sources.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs w-fit flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" />
                    Voir les sources ({sources.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="flex flex-col gap-2 p-3 border-b bg-muted/30">
                    <h4 className="font-medium text-sm">Documents sources</h4>
                    <p className="text-xs text-muted-foreground">Les informations ont été extraites de ces documents :</p>
                  </div>
                  <div className="flex flex-col max-h-72 overflow-y-auto">
                    <Accordion type="single" collapsible className="w-full">
                      {sources.map((src, i) => (
                        <AccordionItem value={`src-${i}`} key={`${src.documentId}-${i}`} className="border-b last:border-0">
                          <AccordionTrigger className="px-3 py-2 hover:bg-muted/10 hover:no-underline flex flex-row items-center justify-between text-left">
                            <div className="flex flex-col gap-1.5 w-full pr-4">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium line-clamp-2">{src.documentTitle}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {src.criticality || 'low'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary" 
                                    style={{ width: `${src.similarity ? Math.round(src.similarity * 100) : 0}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {src.similarity ? Math.round(src.similarity * 100) : 0}%
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          {src.excerpt && (
                            <AccordionContent className="px-3 pb-3 pt-1">
                              <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-md italic border-l-2 border-primary/40">
                                "{src.excerpt}"
                              </div>
                            </AccordionContent>
                          )}
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground">
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
