'use client';

import { useCallback, useRef, useState } from 'react';

import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  X,
} from 'lucide-react';

/**
 * -------------------------------------------------------
 * File Upload Button Component
 * Étape 23 — Phase 6: Multimodal
 *
 * Allows temporary file upload (image/scan/PDF/DOCX)
 * directly into the chat for contextual analysis.
 *
 * These files are NOT ingested into the permanent
 * document base — they are ephemeral context enrichment.
 * -------------------------------------------------------
 */

const ACCEPTED_TYPES = [
  '.pdf',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tiff',
].join(',');

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tiff',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface AttachedFile {
  file: File;
  name: string;
  type: 'image' | 'document';
  previewUrl?: string;
  extractedText?: string;
  extracting: boolean;
  error?: string;
}

export function FileUploadButton({
  onFileAttached,
  attachments,
  onRemoveAttachment,
  disabled,
}: {
  onFileAttached: (attached: AttachedFile) => void;
  attachments: AttachedFile[];
  onRemoveAttachment: (fileName: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);

  const getFileExtension = (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx).toLowerCase() : '';
  };

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      // Reset the input so re-selecting the same file works
      if (inputRef.current) inputRef.current.value = '';

      // Only process up to what is allowed (max 10 total)
      const allowedCount = Math.max(0, 10 - attachments.length);
      const filesToProcess = files.slice(0, allowedCount);

      for (const file of filesToProcess) {
        if (file.size > MAX_FILE_SIZE) {
          onFileAttached({
            file,
            name: file.name,
            type: 'document',
            extracting: false,
            error: 'File too large (max 10 MB)',
          });
          continue;
        }

      const ext = getFileExtension(file.name);
      const isImage = IMAGE_EXTENSIONS.has(ext);
      const fileType = isImage ? 'image' : 'document';

      // Create preview URL for images
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

      const attached: AttachedFile = {
        file,
        name: file.name,
        type: fileType as 'image' | 'document',
        previewUrl,
        extracting: true,
      };

      onFileAttached(attached);
      setExtracting(true);

        // Extract text via API
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/chat/extract', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          if (res.ok && data.text) {
            onFileAttached({
              ...attached,
              extractedText: data.text,
              extracting: false,
            });
          } else {
            onFileAttached({
              ...attached,
              extracting: false,
              error: data.error || 'Text extraction failed',
            });
          }
        } catch {
          onFileAttached({
            ...attached,
            extracting: false,
            error: 'Network error during extraction',
          });
        }
      }
      setExtracting(false);
    },
    [onFileAttached, attachments.length],
  );

  return (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileSelect}
        multiple
        className="hidden"
        id="chat-file-upload"
      />

      <div className="flex items-center">
        {attachments.length < 10 && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach file (image, PDF, DOCX) — temporary context, not permanently ingested"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        )}
      </div>
    </div>
  );
}

export function AttachmentPreview({
  attachment,
  onRemove,
  extracting,
}: {
  attachment: AttachedFile;
  onRemove: () => void;
  extracting: boolean;
}) {
  const isImage = attachment.type === 'image';

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/50 px-2 py-1">
      {/* Icon or thumbnail */}
      {isImage && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-6 w-6 rounded object-cover"
        />
      ) : isImage ? (
        <ImageIcon className="h-4 w-4 text-blue-500" />
      ) : (
        <FileText className="h-4 w-4 text-orange-500" />
      )}

      {/* File name */}
      <span className="max-w-[120px] truncate text-xs text-foreground/80">
        {attachment.name}
      </span>

      {/* Status */}
      {extracting || attachment.extracting ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : attachment.error ? (
        <span className="text-[9px] text-red-400">!</span>
      ) : (
        <span className="text-[9px] text-green-500">✓</span>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
