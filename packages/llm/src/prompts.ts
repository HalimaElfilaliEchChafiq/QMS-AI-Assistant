/**
 * -------------------------------------------------------
 * System Prompt Builder
 * Étapes 13-17 — Phase 4
 *
 * Assembles the complete system prompt from:
 *   - Procedural rules (identity, tone, anti-hallucination)
 *   - Document context (RAG chunks)
 *   - Episodic memory (recent messages)
 *   - Semantic memory (user facts)
 *   - Language configuration
 *   - F1 drill-down instructions
 * -------------------------------------------------------
 */

import type { SearchResult } from '@kit/ingestion/hybrid-search';

import type { ConfidenceLevel } from './confidence';
import {
  type EpisodicMemory,
  formatEpisodicBlock,
  formatSemanticBlock,
  type SemanticFact,
} from './memory';
import { buildProceduralRulesBlock } from './procedural-rules';

// ---------------------------------------------------------------------------
// Language modes (Étape 17)
// ---------------------------------------------------------------------------

export type LanguageMode =
  | 'english_only'
  | 'source_language'
  | 'french_with_english_citations';

const LANGUAGE_INSTRUCTIONS: Record<LanguageMode, string> = {
  english_only:
    'LANGUAGE RULE: Always respond in English, regardless of the language of the source documents or the user query.',
  source_language:
    'LANGUAGE RULE: Respond in the same language as the source documents being cited. If multiple languages are present, use the language of the primary/most cited source.',
  french_with_english_citations:
    'LANGUAGE RULE: Write your response in French. However, when citing specific passages from source documents that are in English, keep the citations in their original English. Format citations like: « [original English text] » (Source: Document Title).',
};

// ---------------------------------------------------------------------------
// F1 Drill-down instructions (Étape 14)
// ---------------------------------------------------------------------------

const F1_INSTRUCTIONS = `## Response Format (F1 Drill-Down)
Structure your response EXACTLY as follows:
1. Start with a BRIEF SUMMARY (2 to 3 sentences maximum) answering the user's core question.
2. On a new line, write EXACTLY the following separator:
---DETAILS---
3. Provide a DETAILED RESPONSE with 5 to 10 bullet points. This section MUST be a thorough explanation and technical deep dive into the subject. Do NOT include inline citations like "[Source: ...]" in the text.
4. After the detailed response, provide a "DETAILED_SOURCES" section in JSON format (this will be parsed by the UI):

\`\`\`json:sources
[
  {
    "bulletIndex": 1,
    "documentTitle": "Document Title",
    "documentId": "uuid",
    "excerpt": "Exact verbatim quote from the source document that supports this point...",
    "chunkIndex": 0
  }
]
\`\`\`

IMPORTANT: The brief summary is shown first. The detailed bullet points are hidden behind a drill-down accordion. The JSON sources are parsed separately. Do not forget the ---DETAILS--- separator.`;

// ---------------------------------------------------------------------------
// Context formatter
// ---------------------------------------------------------------------------

export interface SourceForMessage {
  documentId: string;
  documentTitle: string;
  criticality: string;
  excerpt: string;
  similarity: number;
  chunkIndex: number;
  docType: string | null;
  version: string | null;
}

/**
 * Format search results as a context block for the system prompt.
 */
export function formatContextBlock(results: SearchResult[]): {
  contextBlock: string;
  sources: SourceForMessage[];
} {
  if (results.length === 0) {
    return {
      contextBlock:
        '## Document Context\nNo relevant documents were found in the authorized document base.',
      sources: [],
    };
  }

  const sources: SourceForMessage[] = results.map((r) => ({
    documentId: r.documentId,
    documentTitle: r.document.title,
    criticality: r.document.criticality,
    excerpt: r.content,
    similarity: r.similarity,
    chunkIndex: r.chunkIndex,
    docType: r.document.docType,
    version: r.document.version,
  }));

  const contextLines = results.map((r, i) => {
    return [
      `### Source ${i + 1}: ${r.document.title}`,
      `Type: ${r.document.docType || 'N/A'} | Version: ${r.document.version || 'N/A'} | Criticality: ${r.document.criticality}`,
      `Relevance score: ${(r.combinedScore * 100).toFixed(1)}%`,
      '',
      r.content,
      '',
    ].join('\n');
  });

  return {
    contextBlock: [
      '## Document Context (Retrieved from authorized document base)',
      `${results.length} relevant passage(s) found.`,
      '',
      ...contextLines,
    ].join('\n'),
    sources,
  };
}

// ---------------------------------------------------------------------------
// Main prompt builder
// ---------------------------------------------------------------------------

export interface PromptBuilderInput {
  /** User's current question */
  userQuery: string;
  /** Search results from hybrid search */
  searchResults: SearchResult[];
  /** Episodic memory (recent messages) */
  episodicMemory: EpisodicMemory;
  /** Semantic memory (user facts) */
  semanticFacts: SemanticFact[];
  /** Language mode */
  languageMode: LanguageMode;
  /** Whether results passed the hallucination guard */
  passedGuard: boolean;
}

export interface BuiltPrompt {
  systemPrompt: string;
  sources: SourceForMessage[];
}

/**
 * Build the complete system prompt for the LLM.
 */
export function buildSystemPrompt(input: PromptBuilderInput): BuiltPrompt {
  const {
    searchResults,
    episodicMemory,
    semanticFacts,
    languageMode,
    passedGuard,
  } = input;

  const blocks: string[] = [];

  // 1. Procedural rules (identity, tone, anti-hallucination)
  blocks.push(buildProceduralRulesBlock());

  // 2. Language instruction
  blocks.push(LANGUAGE_INSTRUCTIONS[languageMode]);

  // 3. F1 drill-down format instructions (only if we have results)
  if (passedGuard) {
    blocks.push(F1_INSTRUCTIONS);
  }

  // 4. Semantic memory (user facts)
  const semanticBlock = formatSemanticBlock(semanticFacts);
  if (semanticBlock) {
    blocks.push(semanticBlock);
  }

  // 5. Episodic memory (recent conversation)
  const episodicBlock = formatEpisodicBlock(episodicMemory);
  if (episodicBlock) {
    blocks.push(episodicBlock);
  }

  // 6. Document context
  const { contextBlock, sources } = formatContextBlock(searchResults);
  blocks.push(contextBlock);

  // 7. Anti-hallucination enforcement (if guard failed)
  if (!passedGuard) {
    blocks.push(
      `## IMPORTANT: NO RELEVANT DOCUMENTS FOUND
The search returned no results above the relevance threshold for this query within the user's authorized document scope. You MUST respond with:
"No relevant information found in the authorized document base for this query. Please refine your question or contact an administrator if you believe the relevant documents should be accessible."
Do NOT attempt to answer from general knowledge.`,
    );
  }

  return {
    systemPrompt: blocks.join('\n\n'),
    sources,
  };
}
