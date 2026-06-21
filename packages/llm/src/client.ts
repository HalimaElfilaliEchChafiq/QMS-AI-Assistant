/**
 * -------------------------------------------------------
 * LLM Abstraction Layer
 * Étape 13 — Phase 4: Cœur du Chat IA
 * Ref: section 2 du cahier des charges
 *
 * Provides a common interface for chat completion,
 * with two implementations:
 *   - OllamaLLMProvider  (mode local)
 *   - CloudLLMProvider   (mode cloud — OpenAI)
 *
 * Selection is driven by the DEPLOYMENT_MODE env var.
 * -------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Temperature for generation (0-2, default 0.3 for factual QMS) */
  temperature?: number;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Model override (optional) */
  model?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// Common interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
  /** Send a chat completion request */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Provider name for logging */
  readonly providerName: string;
}

// ---------------------------------------------------------------------------
// Ollama (local) implementation
// ---------------------------------------------------------------------------

export class OllamaLLMProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  readonly providerName = 'ollama';

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl =
      options?.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      'http://127.0.0.1:11434';
    this.model =
      options?.model ||
      process.env.OLLAMA_LLM_MODEL ||
      'llama3.1:8b';
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options?.model || this.model,
        messages,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Ollama chat failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      message: { role: string; content: string };
      model: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      content: data.message.content,
      model: data.model,
      tokensUsed: (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Cloud (OpenAI) implementation
// ---------------------------------------------------------------------------

export class CloudLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly provider: string;
  readonly providerName = 'cloud';

  constructor(options?: {
    provider?: string;
    apiKey?: string;
    model?: string;
  }) {
    this.provider =
      options?.provider || process.env.CLOUD_LLM_PROVIDER || 'openai';
    this.apiKey =
      options?.apiKey || process.env.CLOUD_LLM_API_KEY || '';
    this.model = options?.model || 'gpt-4o';

    if (!this.apiKey) {
      throw new Error(
        'CLOUD_LLM_API_KEY is required for cloud LLM provider',
      );
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    if (this.provider !== 'openai') {
      throw new Error(
        `Cloud LLM provider '${this.provider}' not yet supported`,
      );
    }

    const baseURL = this.apiKey.startsWith('gsk_')
      ? 'https://api.groq.com/openai/v1'
      : 'https://api.openai.com/v1';

    const response = await fetch(
      `${baseURL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(
          baseURL.includes('groq')
            ? {
                model: options?.model || this.model,
                messages,
                ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
              }
            : {
                model: options?.model || this.model,
                messages,
                temperature: options?.temperature ?? 0.3,
                ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
              }
        ),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Cloud chat failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: { role: string; content: string };
      }>;
      model: string;
      usage?: { total_tokens: number };
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices');
    }

    return {
      content: choice.message.content,
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory: select provider based on DEPLOYMENT_MODE
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

export async function createLLMProvider(): Promise<LLMProvider> {
  // 1. Fetch dynamic config from Supabase
  let config: any = null;
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const adminClient = createClient(supabaseUrl, supabaseKey);
    const { data } = await adminClient
      .from('llm_config')
      .select('*')
      .eq('id', 1)
      .single();
    config = data;
  } catch (error) {
    console.warn('[LLM] Failed to read dynamic LLM config, falling back to env variables.', error);
  }

  // 2. Resolve deployment mode (DB > Env > Default)
  const deploymentMode =
    config?.deployment_mode ||
    (process.env.DEPLOYMENT_MODE as 'local' | 'cloud') ||
    'local';

  // 3. Resolve Cloud Mode
  if (deploymentMode === 'cloud') {
    const cloudKey = config?.cloud_key || process.env.CLOUD_LLM_API_KEY || '';
    const cloudModel = config?.cloud_model || process.env.CLOUD_LLM_MODEL || 'gpt-4o';
    
    return new CloudLLMProvider({
      apiKey: cloudKey,
      model: cloudModel,
    });
  }

  // 4. Resolve Local Mode
  const localUrl = config?.local_url || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const localModel = config?.local_model || process.env.OLLAMA_LLM_MODEL || 'llama3:latest';

  return new OllamaLLMProvider({
    baseUrl: localUrl,
    model: localModel,
  });
}

