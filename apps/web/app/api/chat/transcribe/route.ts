/**
 * -------------------------------------------------------
 * API Route: Audio Transcription
 * Étape 23 — Phase 6: Multimodal
 *
 * POST /api/chat/transcribe
 *
 * Receives an audio blob (FormData), transcribes it to text.
 *   - Mode cloud: OpenAI Whisper API
 *   - Mode local: Ollama-compatible local Whisper endpoint
 *                  or informative fallback if unavailable
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 },
      );
    }

    // 3. Fetch dynamic LLM config
    const adminClient = getSupabaseServerAdminClient();
    const { data: config, error: dbError } = await (adminClient as any).from('llm_config').select('*').eq('id', 1).maybeSingle();

    const deploymentMode = config?.deployment_mode || process.env.DEPLOYMENT_MODE || 'local';
    const cloudKey = config?.cloud_key || process.env.OPENAI_API_KEY;

    let text: string;

    if (deploymentMode === 'cloud' && cloudKey) {
      text = await transcribeWithWhisperCloud(audioFile, cloudKey);
    } else {
      text = await transcribeWithWhisperLocal(audioFile);
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error('[API /api/chat/transcribe] Error:', err);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 },
    );
  }
}

/**
 * Transcribe using OpenAI Whisper API (cloud mode)
 */
async function transcribeWithWhisperCloud(audioBlob: Blob, apiKey: string): Promise<string> {
  if (!apiKey) {
    throw new Error('API key is required for cloud transcription');
  }

  const isGroq = apiKey.startsWith('gsk_');
  const baseUrl = isGroq 
    ? 'https://api.groq.com/openai/v1/audio/transcriptions' 
    : 'https://api.openai.com/v1/audio/transcriptions';
  const model = isGroq ? 'whisper-large-v3' : 'whisper-1';

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model', model);
  formData.append('response_format', 'json');

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Whisper API Error] Status: ${response.status} | Body: ${body}`);
      throw new Error(`Whisper API failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text;
  } catch (error) {
    console.error(`[transcribeWithWhisperCloud] Critical Error:`, error);
    throw error;
  }
}

/**
 * Transcribe using a local Whisper-compatible endpoint (local mode).
 * Falls back to an informative message if no local STT service is available.
 */
async function transcribeWithWhisperLocal(audioBlob: Blob): Promise<string> {
  const whisperUrl =
    process.env.WHISPER_LOCAL_URL || 'http://127.0.0.1:8000/v1/audio/transcriptions';

  try {
    // Try the local Whisper endpoint (e.g. faster-whisper-server)
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', 'Systran/faster-whisper-tiny');
    formData.append('response_format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout for CPU and model downloading

    const response = await fetch(whisperUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Local Whisper failed (${response.status})`);
    }

    const data = (await response.json()) as { text?: string };
    if (data.text) {
      return data.text;
    }

    throw new Error('Empty transcription from local Whisper');
  } catch (err: any) {
    // Fallback: no local STT available
    console.warn(
      '[Transcribe] Local Whisper not available. Returning fallback message.', err.message
    );
    throw new Error(
      'Voice transcription is not available in local mode. ' +
        'Please install a local Whisper server (e.g. faster-whisper-server) ' +
        'or switch to DEPLOYMENT_MODE=cloud.',
    );
  }
}
