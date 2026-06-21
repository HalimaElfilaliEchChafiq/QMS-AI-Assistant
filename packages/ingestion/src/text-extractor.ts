/**
 * -------------------------------------------------------
 * Text Extractor Module
 * Étape 6 — Extracts text from PDF, DOCX, and plain text files.
 * -------------------------------------------------------
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

export interface ExtractedText {
  /** The extracted raw text content */
  text: string;
  /** Detected file format */
  format: 'pdf' | 'docx' | 'txt' | 'md' | 'unknown';
}

/**
 * Extract text from a file based on its extension.
 *
 * Supported formats:
 * - .pdf → via pdf-parse
 * - .docx → via mammoth
 * - .txt / .md → direct read as UTF-8
 */
export async function extractText(filePath: string): Promise<ExtractedText> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return extractFromPdf(filePath);
    case '.docx':
      return extractFromDocx(filePath);
    case '.txt':
    case '.md':
      return extractFromPlainText(filePath, ext === '.md' ? 'md' : 'txt');
    default:
      throw new Error(
        `Unsupported file format: ${ext}. Supported: .pdf, .docx, .txt, .md`,
      );
  }
}

/**
 * Extract text from an in-memory buffer.
 * Used by the Verify mode (Étape 19) for temporary document uploads
 * that should NOT be persisted to storage.
 *
 * @param buffer  The raw file bytes
 * @param filename  Original filename (used to detect format via extension)
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ExtractedText> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf': {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return { text: data.text.trim(), format: 'pdf' };
    }
    case '.docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.trim(), format: 'docx' };
    }
    case '.txt':
    case '.md':
      return {
        text: buffer.toString('utf-8').trim(),
        format: ext === '.md' ? 'md' : 'txt',
      };
    default:
      throw new Error(
        `Unsupported file format: ${ext}. Supported: .pdf, .docx, .txt, .md`,
      );
  }
}

/**
 * Extract text from a PDF file.
 */
async function extractFromPdf(filePath: string): Promise<ExtractedText> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text.trim(),
    format: 'pdf',
  };
}

/**
 * Extract text from a DOCX file.
 */
async function extractFromDocx(filePath: string): Promise<ExtractedText> {
  const mammoth = await import('mammoth');
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value.trim(),
    format: 'docx',
  };
}

/**
 * Read plain text or markdown file.
 */
async function extractFromPlainText(
  filePath: string,
  format: 'txt' | 'md',
): Promise<ExtractedText> {
  const content = await readFile(filePath, 'utf-8');
  return {
    text: content.trim(),
    format,
  };
}

/**
 * Detect language heuristic (simple, based on word frequency).
 * Returns 'fr' for French, 'en' for English, or 'unknown'.
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000).toLowerCase();

  const frenchMarkers = [
    'le ', 'la ', 'les ', 'des ', 'un ', 'une ',
    'est ', 'sont ', 'dans ', 'pour ', 'avec ',
    'que ', 'qui ', 'ce ', 'cette ', 'sur ',
    'du ', 'au ', 'aux ', "l'", "d'", "n'",
    'é', 'è', 'ê', 'à', 'ù', 'ç', 'î', 'ô',
  ];

  const englishMarkers = [
    'the ', 'is ', 'are ', 'was ', 'were ',
    'have ', 'has ', 'had ', 'been ', 'with ',
    'this ', 'that ', 'from ', 'they ', 'which ',
    'will ', 'would ', 'could ', 'should ',
  ];

  let frScore = 0;
  let enScore = 0;

  for (const marker of frenchMarkers) {
    if (sample.includes(marker)) frScore++;
  }
  for (const marker of englishMarkers) {
    if (sample.includes(marker)) enScore++;
  }

  if (frScore > enScore) return 'fr';
  if (enScore > frScore) return 'en';
  return 'unknown';
}
