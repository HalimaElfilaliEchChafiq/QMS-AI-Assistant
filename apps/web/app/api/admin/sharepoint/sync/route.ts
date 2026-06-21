/**
 * -------------------------------------------------------
 * API Route: SharePoint Synchronization
 * Étape 24 — Phase 6: Connecteur SharePoint
 *
 * POST /api/admin/sharepoint/sync
 *
 * Admin-only route that:
 *   1. Connects to SharePoint via Microsoft Graph API
 *   2. Lists all files in the configured document library
 *   3. For each new/updated file:
 *      a. Downloads the file content
 *      b. Retrieves file permissions → maps to criticality_level
 *      c. Extracts text (via existing text-extractor)
 *      d. Chunks text (via existing chunking module)
 *      e. Generates embeddings (via existing embedding provider)
 *      f. Inserts into documents + document_chunks (source='sharepoint')
 *   4. Logs all actions to audit_trail
 * -------------------------------------------------------
 */

import { NextResponse } from 'next/server';

import { chunkText } from '@kit/ingestion/chunking';
import { createEmbeddingProvider } from '@kit/ingestion/embeddings';
import {
  type SharePointConfig,
  type SharePointSyncResult,
  downloadFile,
  getFilePermissions,
  listDriveItems,
  loadSharePointConfig,
} from '@kit/ingestion/sharepoint-connector';
import { mapPermissionsToCriticality } from '@kit/ingestion/sharepoint-permissions';
import { extractTextFromBuffer, detectLanguage } from '@kit/ingestion/text-extractor';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

// Supported file extensions for ingestion
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

// ---------------------------------------------------------------------------
// Admin check (same pattern as /api/admin/documents)
// ---------------------------------------------------------------------------
async function verifyAdmin() {
  const userClient = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  const adminClient = getSupabaseServerAdminClient();
  const { data: account } = await adminClient
    .from('accounts')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!account || account.role !== 'admin') return null;
  return user;
}

// ---------------------------------------------------------------------------
// POST /api/admin/sharepoint/sync
// ---------------------------------------------------------------------------
export async function POST() {
  try {
    const user = await verifyAdmin();
    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 },
      );
    }

    // Load config (will throw if incomplete)
    let config: SharePointConfig;
    try {
      config = loadSharePointConfig();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Configuration error';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const adminClient = getSupabaseServerAdminClient();
    const embeddingProvider = createEmbeddingProvider();

    // 1. List all files in SharePoint
    const driveItems = await listDriveItems(config);

    // 2. Get existing SharePoint documents from DB
    const { data: existingDocs } = await adminClient
      .from('documents')
      .select('id, title, file_path, updated_at')
      .eq('source', 'sharepoint');

    const existingByTitle = new Map(
      (existingDocs || []).map((d) => [d.title, d]),
    );

    // 3. Sync each file
    const result: SharePointSyncResult = {
      totalFiles: driveItems.length,
      newFiles: 0,
      updatedFiles: 0,
      skippedFiles: 0,
      errors: [],
    };

    for (const item of driveItems) {
      try {
        const ext = getFileExtension(item.name);

        // Skip unsupported file types
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          result.skippedFiles++;
          continue;
        }

        // Check if already synced and up-to-date
        const existing = existingByTitle.get(item.name);
        if (existing) {
          const existingDate = existing.updated_at
            ? new Date(existing.updated_at).getTime()
            : 0;
          const spDate = new Date(item.lastModifiedDateTime).getTime();

          if (spDate <= existingDate) {
            result.skippedFiles++;
            continue;
          }

          // File was updated — delete old chunks and re-ingest
          await adminClient
            .from('document_chunks')
            .delete()
            .eq('document_id', existing.id);

          await adminClient
            .from('documents')
            .delete()
            .eq('id', existing.id);

          result.updatedFiles++;
        } else {
          result.newFiles++;
        }

        // 3a. Download file
        const fileBuffer = await downloadFile(config, item.id);

        // 3b. Get permissions and map to criticality
        const permissions = await getFilePermissions(config, item.id);
        const criticality = mapPermissionsToCriticality(permissions);

        // 3c. Extract text
        const extracted = await extractTextFromBuffer(fileBuffer, item.name);

        if (!extracted.text || extracted.text.trim().length === 0) {
          result.errors.push({
            fileName: item.name,
            error: 'No text could be extracted',
          });
          continue;
        }

        // 3d. Detect language
        const language = detectLanguage(extracted.text);

        // 3e. Insert document row
        const storagePath = `sharepoint/${item.id}_${item.name}`;
        const { data: docRow, error: docError } = await adminClient
          .from('documents')
          .insert({
            title: item.name.replace(/\.[^/.]+$/, ''),
            file_path: storagePath,
            criticality,
            doc_type: null,
            version: 'v1',
            owner: null,
            site: null,
            language,
            source: 'sharepoint' as const,
          })
          .select('id')
          .single();

        if (docError || !docRow) {
          result.errors.push({
            fileName: item.name,
            error: `DB insert failed: ${docError?.message || 'unknown'}`,
          });
          continue;
        }

        // 3f. Chunk text
        const chunks = chunkText(extracted.text, {
          metadata: {
            criticality,
            doc_type: null,
            source: 'sharepoint',
            document_title: item.name,
          },
        });

        // 3g. Generate embeddings (batch)
        const chunkTexts = chunks.map((c) => c.content);
        const embeddings = await embeddingProvider.embedBatch(chunkTexts);

        // 3h. Insert chunks
        const chunkRows = chunks.map((chunk, idx) => ({
          document_id: docRow.id,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[idx]),
          chunk_index: chunk.index,
          metadata: (chunk.metadata || {}) as Record<string, string | number | boolean | null>,
        }));

        const { error: chunkError } = await adminClient
          .from('document_chunks')
          .insert(chunkRows);

        if (chunkError) {
          result.errors.push({
            fileName: item.name,
            error: `Chunk insert failed: ${chunkError.message}`,
          });
        }

        // 3i. Upload file to storage for reference
        await adminClient.storage
          .from('qms_documents')
          .upload(storagePath, fileBuffer, {
            contentType: item.file?.mimeType || 'application/octet-stream',
            upsert: true,
          });

        // 3j. Audit trail
        await adminClient.from('audit_trail').insert({
          user_id: user.id,
          action: 'sharepoint_sync',
          document_id: docRow.id,
          query: `Synced from SharePoint: ${item.name} (${criticality})`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({ fileName: item.name, error: msg });
      }
    }

    // 4. Final audit entry for the sync operation
    await adminClient.from('audit_trail').insert({
      user_id: user.id,
      action: 'sharepoint_sync_complete',
      query: `SharePoint sync complete: ${result.newFiles} new, ${result.updatedFiles} updated, ${result.skippedFiles} skipped, ${result.errors.length} errors`,
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('[API /api/admin/sharepoint/sync] Error:', err);
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
