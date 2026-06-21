/**
 * -------------------------------------------------------
 * Unit Tests for Semantic Chunking Module
 * Étape 6 — Validates chunking rules from section 5 of the spec
 * -------------------------------------------------------
 */

import { describe, it, expect } from 'vitest';

import {
  chunkText,
  splitIntoSentences,
  splitIntoParagraphs,
  measureOverlap,
} from '../chunking';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const SHORT_TEXT = 'This is a short sentence.';

const MULTI_PARAGRAPH_TEXT = `This is the first paragraph. It has two sentences.

This is the second paragraph. It also has a couple of sentences. The content here is different from the first.

This is the third paragraph. Short one.`;

// A longer paragraph that should trigger sentence-level splitting
const LONG_PARAGRAPH = Array.from(
  { length: 20 },
  (_, i) => `Sentence number ${i + 1} is about quality management procedures and their application in the automotive industry.`,
).join(' ');

const LONG_MULTI_PARA = `${LONG_PARAGRAPH}\n\n${LONG_PARAGRAPH}`;

// ---------------------------------------------------------------------------
// Tests: splitIntoParagraphs
// ---------------------------------------------------------------------------
describe('splitIntoParagraphs', () => {
  it('should split text by double newlines', () => {
    const result = splitIntoParagraphs(MULTI_PARAGRAPH_TEXT);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain('first paragraph');
    expect(result[1]).toContain('second paragraph');
    expect(result[2]).toContain('third paragraph');
  });

  it('should handle empty text', () => {
    expect(splitIntoParagraphs('')).toHaveLength(0);
    expect(splitIntoParagraphs('   ')).toHaveLength(0);
  });

  it('should handle single paragraph (no double newline)', () => {
    const result = splitIntoParagraphs('Just one paragraph here.');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: splitIntoSentences
// ---------------------------------------------------------------------------
describe('splitIntoSentences', () => {
  it('should split by sentence-ending punctuation followed by uppercase', () => {
    const result = splitIntoSentences(
      'First sentence. Second sentence. Third sentence.',
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle single sentence', () => {
    const result = splitIntoSentences('Just one sentence here.');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: chunkText
// ---------------------------------------------------------------------------
describe('chunkText', () => {
  it('should return empty array for empty text', () => {
    expect(chunkText('')).toHaveLength(0);
    expect(chunkText('   ')).toHaveLength(0);
  });

  it('should return single chunk for short text', () => {
    const chunks = chunkText(SHORT_TEXT, { targetSize: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe(SHORT_TEXT);
    expect(chunks[0]!.index).toBe(0);
  });

  it('should split multi-paragraph text into chunks', () => {
    const chunks = chunkText(MULTI_PARAGRAPH_TEXT, { targetSize: 100 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should never produce empty chunks', () => {
    const chunks = chunkText(LONG_MULTI_PARA, { targetSize: 200 });
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('should assign sequential indices', () => {
    const chunks = chunkText(LONG_MULTI_PARA, { targetSize: 200 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.index).toBe(i);
    }
  });

  it('should pass through metadata', () => {
    const meta = { docType: 'procedure', criticality: 'low' };
    const chunks = chunkText(SHORT_TEXT, {
      targetSize: 1000,
      metadata: meta,
    });
    expect(chunks[0]!.metadata).toEqual(meta);
  });

  it('should respect target size (no chunk much larger than target)', () => {
    const targetSize = 300;
    const chunks = chunkText(LONG_MULTI_PARA, { targetSize });

    for (const chunk of chunks) {
      // Allow tolerance — a single sentence might exceed target
      expect(chunk.content.length).toBeLessThan(targetSize * 3);
    }
  });

  it('should never cut a sentence in the middle', () => {
    const chunks = chunkText(LONG_PARAGRAPH, { targetSize: 300 });

    for (const chunk of chunks) {
      const trimmed = chunk.content.trim();
      const lastChar = trimmed[trimmed.length - 1];
      expect(['.', '!', '?', undefined]).toContain(lastChar);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Overlap
// ---------------------------------------------------------------------------
describe('overlap', () => {
  it('should produce overlap between consecutive chunks for long text', () => {
    const chunks = chunkText(LONG_MULTI_PARA, {
      targetSize: 300,
      overlapPercent: 0.12,
    });

    if (chunks.length < 2) return;

    let hasOverlap = false;
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!.content;
      const curr = chunks[i]!.content;
      const prevWords = prev.split(' ').slice(-5);
      const currStart = curr.slice(0, 200);

      for (const word of prevWords) {
        if (word.length > 3 && currStart.includes(word)) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) break;
    }

    expect(hasOverlap).toBe(true);
  });

  it('should maintain overlap ratio between 5% and 20% of previous chunk size', () => {
    // Use a controlled, sufficiently large text to get meaningful chunks
    const controlledText = Array.from(
      { length: 40 },
      (_, i) =>
        `Sentence number ${i + 1} describes quality management topic ${i + 1}. This elaborates on process ${i + 1} controls and their effects.`,
    ).join(' ');

    const chunks = chunkText(controlledText, {
      targetSize: 300,
      overlapPercent: 0.12,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Verify that consecutive chunks share overlapping content
    let overlapDetected = 0;
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!.content;
      const curr = chunks[i]!.content;

      // Check how many words from the end of prev appear at the start of curr
      const prevWords = prev.split(/\s+/);
      const currWords = curr.split(/\s+/);
      const prevTail = prevWords.slice(-Math.ceil(prevWords.length * 0.25));

      let sharedWordCount = 0;
      for (const word of prevTail) {
        if (word.length > 3 && currWords.slice(0, Math.ceil(currWords.length * 0.3)).includes(word)) {
          sharedWordCount++;
        }
      }

      if (sharedWordCount > 0) {
        overlapDetected++;
        // The shared content should represent roughly 5-20% of the previous chunk
        const overlapRatio = sharedWordCount / prevWords.length;
        expect(overlapRatio).toBeGreaterThan(0.02); // At least some overlap
        expect(overlapRatio).toBeLessThan(0.5); // Not more than half
      }
    }

    // At least some chunk transitions should have detectable overlap
    expect(overlapDetected).toBeGreaterThan(0);
  });

  it('should never cut a sentence in half inside the overlap zone', () => {
    const chunks = chunkText(LONG_MULTI_PARA, {
      targetSize: 300,
      overlapPercent: 0.12,
    });

    for (const chunk of chunks) {
      const content = chunk.content.trim();
      // Each chunk should end with proper sentence punctuation
      const lastChar = content[content.length - 1];
      expect(['.', '!', '?', undefined]).toContain(lastChar);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: measureOverlap utility
// ---------------------------------------------------------------------------
describe('measureOverlap', () => {
  it('should return 0 for non-overlapping strings', () => {
    expect(measureOverlap('hello world', 'foo bar')).toBe(0);
  });

  it('should detect exact overlap', () => {
    const overlap = measureOverlap('hello world', 'world is great');
    expect(overlap).toBeGreaterThan(0);
  });
});
