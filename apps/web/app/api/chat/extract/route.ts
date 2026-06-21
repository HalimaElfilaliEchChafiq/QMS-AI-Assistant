/**
 * -------------------------------------------------------
 * API Route: File Text Extraction
 * Étape 23 — Phase 6: Multimodal
 *
 * POST /api/chat/extract
 *
 * Receives a file upload (FormData), extracts text content.
 *   - PDF/DOCX: Uses existing extractTextFromBuffer
 *   - Images (cloud): OpenAI Vision API for OCR/description
 *   - Images (local): Fallback with informative message
 *     (no local LLaVA/vision model available)
 *
 * NOTE: These are TEMPORARY files for context enrichment,
 *       NOT permanently ingested into the document base.
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { extractTextFromBuffer } from '@kit/ingestion/text-extractor';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

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
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 },
      );
    }

    const fileName =
      file instanceof File ? file.name : 'unnamed';
    const ext = getFileExtension(fileName);

    // 3. Size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 10 MB)' },
        { status: 400 },
      );
    }

    // 4. Extract text based on file type
    let text: string;
    let fileType: string;

    if (IMAGE_EXTENSIONS.has(ext)) {
      // Image file — use vision/OCR
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await extractTextFromImage(buffer, fileName, ext);
      text = result.text;
      fileType = 'image';
    } else if (ext === '.pdf' || ext === '.docx' || ext === '.txt' || ext === '.md') {
      // Document file — use existing text extractor
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await extractTextFromBuffer(buffer, fileName);
      text = result.text;
      fileType = result.format;
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt, .md, .png, .jpg, .jpeg, .webp, .tiff`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      text,
      fileType,
      fileName,
    });
  } catch (err) {
    console.error('[API /api/chat/extract] Error:', err);
    const message =
      err instanceof Error ? err.message : 'Text extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Extract text from an image.
 *   - Cloud mode: Uses OpenAI Vision API (GPT-4o) for OCR/description
 *   - Local mode: Provides informative fallback (no LLaVA available)
 */
async function extractTextFromImage(
  buffer: Buffer,
  _fileName: string,
  _ext: string,
): Promise<{ text: string }> {
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'local';

  if (deploymentMode === 'cloud') {
    return extractImageWithCloudVision(buffer);
  }

  return extractImageLocalFallback();
}

/**
 * Cloud Vision: send image to OpenAI GPT-4o for analysis
 */
async function extractImageWithCloudVision(
  buffer: Buffer,
): Promise<{ text: string }> {
  const apiKey = process.env.CLOUD_LLM_API_KEY;
  if (!apiKey) {
    throw new Error('CLOUD_LLM_API_KEY is required for cloud image analysis');
  }

  const base64 = buffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract ALL text from this image/document scan. If it is a diagram or schematic, also describe its structure and relationships. Provide the complete extracted content.',
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Vision failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI Vision returned no content');
  }

  return { text: content };
}

/**
 * Local fallback when no vision model is available.
 * Returns an informative message so the user knows what happened.
 */
function extractImageLocalFallback(): { text: string } {
  return {
    text:
      '[Image attached — full visual analysis requires a vision model (e.g. LLaVA). ' +
      'Currently running in local mode without a vision model. ' +
      'To enable image analysis: install LLaVA via Ollama (ollama pull llava) ' +
      'or switch to DEPLOYMENT_MODE=cloud. ' +
      'If this image contains text, consider uploading it as a PDF/DOCX instead for automatic text extraction.]',
  };
}
