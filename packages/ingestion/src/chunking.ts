/**
 * -------------------------------------------------------
 * Semantic Chunking Module
 * Étape 6 — Ref: section 5 du cahier des charges
 *
 * Rules:
 * - Split by paragraphs (\n\n), then by sentences if chunk > target size
 * - Overlap of 10–15% between consecutive chunks
 * - Never cut in the middle of a sentence
 * -------------------------------------------------------
 */

export interface ChunkOptions {
  /** Target chunk size in characters (default: 1000) */
  targetSize?: number;
  /** Overlap percentage between consecutive chunks (default: 0.12 = 12%) */
  overlapPercent?: number;
}

export interface Chunk {
  /** Chunk content text */
  content: string;
  /** Zero-based index of this chunk in the document */
  index: number;
  /** Metadata passed through from the document */
  metadata?: Record<string, unknown>;
}

const DEFAULT_TARGET_SIZE = 1000;
const DEFAULT_OVERLAP_PERCENT = 0.12;

/**
 * Split text into sentences.
 * Handles common abbreviations and decimal numbers to avoid false splits.
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace and uppercase
  const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z\u00C0-\u024F])/g;
  const raw = text.split(sentenceRegex).filter((s) => s.trim().length > 0);

  // Fallback: if regex didn't split (no uppercase after punctuation)
  if (raw.length <= 1 && text.includes('. ')) {
    return text
      .split(/(?<=\.)\s+/)
      .filter((s) => s.trim().length > 0);
  }

  return raw;
}

/**
 * Split text into paragraphs.
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Group sentences into chunks respecting the target size.
 * Never cuts in the middle of a sentence.
 */
function groupSentencesIntoChunks(
  sentences: string[],
  targetSize: number,
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length > targetSize && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Apply overlap between consecutive chunks.
 * Takes the last N% characters from the previous chunk and prepends to the next.
 */
function applyOverlap(chunks: string[], overlapPercent: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]!];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1]!;
    const currentChunk = chunks[i]!;

    const overlapSize = Math.floor(prevChunk.length * overlapPercent);

    if (overlapSize > 0) {
      const overlapText = prevChunk.slice(-overlapSize);

      // Find the LAST sentence boundary (". ") in the overlap zone
      // so we keep as much overlap as possible while staying on a
      // sentence boundary.
      const lastBoundary = overlapText.lastIndexOf('. ');

      let cleanOverlap: string;
      if (lastBoundary >= 0) {
        // Keep from the start of the overlap zone up to (and including)
        // the sentence ending, then start from the next sentence.
        cleanOverlap = overlapText.slice(lastBoundary + 2).trim();

        // If slicing at the last boundary leaves almost nothing,
        // fall back to the full overlap zone.
        if (cleanOverlap.length < overlapSize * 0.3) {
          cleanOverlap = overlapText.trim();
        }
      } else {
        // No sentence boundary — use the full overlap zone
        cleanOverlap = overlapText.trim();
      }

      if (cleanOverlap.length > 0) {
        result.push(`${cleanOverlap} ${currentChunk}`);
      } else {
        result.push(currentChunk);
      }
    } else {
      result.push(currentChunk);
    }
  }

  return result;
}

/**
 * Main chunking function.
 *
 * 1. Split text into paragraphs
 * 2. For large paragraphs, split into sentences and group
 * 3. Merge very small consecutive chunks
 * 4. Apply overlap between consecutive chunks
 *
 * @param text - The full document text to chunk
 * @param options - Chunking configuration
 * @returns Array of Chunk objects with content and index
 */
export function chunkText(
  text: string,
  options?: ChunkOptions & { metadata?: Record<string, unknown> },
): Chunk[] {
  const targetSize = options?.targetSize ?? DEFAULT_TARGET_SIZE;
  const overlapPercent = options?.overlapPercent ?? DEFAULT_OVERLAP_PERCENT;
  const metadata = options?.metadata;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Step 1: Split into paragraphs
  const paragraphs = splitIntoParagraphs(text);

  // Step 2: Process each paragraph
  const rawChunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= targetSize) {
      rawChunks.push(paragraph);
    } else {
      const sentences = splitIntoSentences(paragraph);
      const subChunks = groupSentencesIntoChunks(sentences, targetSize);
      rawChunks.push(...subChunks);
    }
  }

  // Step 3: Merge very small consecutive chunks
  const mergedChunks: string[] = [];
  let buffer = '';

  for (const chunk of rawChunks) {
    if (buffer.length === 0) {
      buffer = chunk;
    } else if (buffer.length + chunk.length + 1 <= targetSize) {
      buffer = `${buffer}\n\n${chunk}`;
    } else {
      mergedChunks.push(buffer);
      buffer = chunk;
    }
  }

  if (buffer.length > 0) {
    mergedChunks.push(buffer);
  }

  // Step 4: Apply overlap
  const overlappedChunks = applyOverlap(mergedChunks, overlapPercent);

  // Step 5: Create Chunk objects
  return overlappedChunks.map((content, index) => ({
    content,
    index,
    metadata,
  }));
}

/**
 * Measure the actual overlap percentage between two consecutive chunks.
 * Useful for testing.
 */
export function measureOverlap(chunk1: string, chunk2: string): number {
  const maxLen = Math.min(chunk1.length, chunk2.length);

  for (let len = maxLen; len > 0; len--) {
    const suffix = chunk1.slice(-len);
    if (chunk2.startsWith(suffix)) {
      return len / chunk1.length;
    }
  }

  return 0;
}
