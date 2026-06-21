/**
 * -------------------------------------------------------
 * Confidence Score Calculator
 * Étape 16 — Phase 4: Score de confiance & anti-hallucination
 * Ref: section 9 du cahier des charges
 *
 * Calculates a confidence level (low/medium/high) based on:
 *   - Average vector similarity of retrieved chunks
 *   - Coverage (number of distinct source documents)
 *   - Freshness (recency of cited documents)
 *
 * Also provides the anti-hallucination guard:
 *   if no chunk exceeds the relevance threshold → "not_found"
 * -------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ConfidenceInput {
  /** Similarity scores from retrieved chunks */
  similarities: number[];
  /** Number of distinct source documents */
  distinctDocuments: number;
  /** Document versions/dates for freshness (ISO strings or null) */
  documentDates: (string | null)[];
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number; // 0-1 normalized
  details: {
    avgSimilarity: number;
    coverageScore: number;
    freshnessScore: number;
  };
}

// ---------------------------------------------------------------------------
// Configuration (thresholds)
// ---------------------------------------------------------------------------

export const CONFIDENCE_CONFIG = {
  /** Minimum similarity for a chunk to be considered relevant */
  relevanceThreshold: 0.35,

  /** Weights for the composite score */
  weights: {
    similarity: 0.5,
    coverage: 0.3,
    freshness: 0.2,
  },

  /** Score boundaries for confidence levels */
  levels: {
    high: 0.65,   // score >= 0.65 → HIGH
    medium: 0.40, // score >= 0.40 → MEDIUM
    // below 0.40 → LOW
  },

  /** Maximum age in days for "fresh" documents */
  freshnessMaxDays: 365,
} as const;

// ---------------------------------------------------------------------------
// Anti-hallucination guard
// ---------------------------------------------------------------------------

/**
 * Check if search results are relevant enough to generate a response.
 * If no chunk exceeds the relevance threshold, the system should
 * respond with "Not Found" instead of generating an answer.
 *
 * @returns true if results are relevant enough to proceed
 */
export function passesHallucinationGuard(
  similarities: number[],
  threshold?: number,
): boolean {
  const minThreshold = threshold ?? CONFIDENCE_CONFIG.relevanceThreshold;

  if (similarities.length === 0) return false;

  // At least one chunk must exceed the threshold
  return similarities.some((s) => s >= minThreshold);
}

// ---------------------------------------------------------------------------
// Confidence calculator
// ---------------------------------------------------------------------------

/**
 * Calculate a confidence level for a set of search results.
 */
export function calculateConfidence(
  input: ConfidenceInput,
): ConfidenceResult {
  const { similarities, distinctDocuments, documentDates } = input;

  // 1. Average similarity
  const avgSimilarity =
    similarities.length > 0
      ? similarities.reduce((a, b) => a + b, 0) / similarities.length
      : 0;

  // 2. Coverage score (more distinct sources = higher confidence)
  // Normalized: 1 source = 0.3, 2 = 0.5, 3 = 0.7, 4+ = 0.9, 5+ = 1.0
  const coverageScore = Math.min(
    1.0,
    distinctDocuments <= 0
      ? 0
      : 0.1 + distinctDocuments * 0.2,
  );

  // 3. Freshness score (how recent are the documents)
  const freshnessScore = calculateFreshness(documentDates);

  // 4. Composite score
  const score =
    avgSimilarity * CONFIDENCE_CONFIG.weights.similarity +
    coverageScore * CONFIDENCE_CONFIG.weights.coverage +
    freshnessScore * CONFIDENCE_CONFIG.weights.freshness;

  // 5. Map to level
  let level: ConfidenceLevel;
  if (score >= CONFIDENCE_CONFIG.levels.high) {
    level = 'high';
  } else if (score >= CONFIDENCE_CONFIG.levels.medium) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return {
    level,
    score: Math.round(score * 100) / 100,
    details: {
      avgSimilarity: Math.round(avgSimilarity * 100) / 100,
      coverageScore: Math.round(coverageScore * 100) / 100,
      freshnessScore: Math.round(freshnessScore * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function calculateFreshness(dates: (string | null)[]): number {
  const validDates = dates
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));

  if (validDates.length === 0) return 0.5; // Unknown age = neutral

  const now = Date.now();
  const maxAge = CONFIDENCE_CONFIG.freshnessMaxDays * 24 * 60 * 60 * 1000;

  const avgAge =
    validDates.reduce((sum, t) => sum + (now - t), 0) / validDates.length;

  // Newer documents → higher score (linear decay)
  return Math.max(0, Math.min(1, 1 - avgAge / maxAge));
}
