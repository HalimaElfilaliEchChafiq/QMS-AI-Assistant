/**
 * -------------------------------------------------------
 * Embedding Abstraction Layer
 * Étape 7 — Ref: section 5 du cahier des charges
 *
 * Provides a common interface for embedding generation,
 * with two implementations:
 *   - OllamaEmbeddingProvider (mode local)
 *   - CloudEmbeddingProvider  (mode cloud)
 *
 * Selection is driven by the DEPLOYMENT_MODE env var.
 * -------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Common interface
// ---------------------------------------------------------------------------
export interface EmbeddingProvider {
  /** Generate an embedding vector for a single text chunk */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple text chunks (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Dimension of the embedding vectors produced */
  readonly dimension: number;
}

// ---------------------------------------------------------------------------
// Ollama (local) implementation
// ---------------------------------------------------------------------------
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  readonly dimension: number;

  constructor(options?: {
    baseUrl?: string;
    model?: string;
    dimension?: number;
  }) {
    this.baseUrl =
      options?.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      'http://127.0.0.1:11434';
    this.model =
      options?.model ||
      process.env.OLLAMA_EMBEDDING_MODEL ||
      'nomic-embed-text';
    // nomic-embed-text produces 768-dim vectors by default
    this.dimension = options?.dimension ?? 768;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama embedding failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      embeddings: number[][];
    };

    if (!data.embeddings?.[0]) {
      throw new Error('Ollama returned empty embeddings');
    }

    return data.embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama /api/embed supports batch input natively
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama batch embedding failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      embeddings: number[][];
    };

    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new Error(
        `Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`,
      );
    }

    return data.embeddings;
  }
}

// ---------------------------------------------------------------------------
// Cloud (OpenAI / Anthropic) implementation
// ---------------------------------------------------------------------------
export class CloudEmbeddingProvider implements EmbeddingProvider {
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly model: string;
  readonly dimension: number;

  constructor(options?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    dimension?: number;
  }) {
    this.provider =
      options?.provider || process.env.CLOUD_LLM_PROVIDER || 'openai';
    this.apiKey =
      options?.apiKey || process.env.CLOUD_LLM_API_KEY || '';
    this.model = options?.model || 'text-embedding-3-small';
    this.dimension = options?.dimension ?? 768;

    if (!this.apiKey) {
      throw new Error(
        'CLOUD_LLM_API_KEY is required for cloud embedding provider',
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    if (this.provider === 'openai') {
      return this.openaiEmbed([text]).then((r) => r[0]!);
    }
    throw new Error(`Cloud embedding provider '${this.provider}' not yet supported for embeddings`);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.provider === 'openai') {
      return this.openaiEmbed(texts);
    }
    throw new Error(`Cloud embedding provider '${this.provider}' not yet supported for embeddings`);
  }

  private async openaiEmbed(inputs: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: inputs,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI embedding failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to guarantee order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

// ---------------------------------------------------------------------------
// Factory: select provider based on DEPLOYMENT_MODE
// ---------------------------------------------------------------------------
export function createEmbeddingProvider(
  mode?: 'local' | 'cloud',
): EmbeddingProvider {
  const deploymentMode =
    mode || (process.env.DEPLOYMENT_MODE as 'local' | 'cloud') || 'local';

  if (deploymentMode === 'cloud') {
    return new CloudEmbeddingProvider();
  }

  return new OllamaEmbeddingProvider();
}
