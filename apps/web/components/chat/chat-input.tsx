'use client';

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { Send } from 'lucide-react';

import { AudioRecorder } from './audio-recorder';
import type { AttachedFile } from './file-upload-button';
import { FileUploadButton, AttachmentPreview } from './file-upload-button';

/**
 * -------------------------------------------------------
 * Chat Input Component
 * Phase 4 → Extended in Phase 6 (Étape 23)
 *
 * Features:
 *   - Auto-resize textarea (grows with content, max 120px)
 *   - Enter to send, Shift+Enter for newline
 *   - Disabled state while sending
 *   - [Phase 6] Audio recorder (voice input → transcription)
 *   - [Phase 6] File upload (image/PDF/DOCX → context)
 * -------------------------------------------------------
 */

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  attachments,
  onFileAttached,
  onRemoveAttachment,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  /** Phase 6: current file attachments (if any) */
  attachments: AttachedFile[];
  /** Phase 6: callback when a file is attached/updated */
  onFileAttached: (attached: AttachedFile) => void;
  /** Phase 6: callback to remove attachment */
  onRemoveAttachment: (fileName: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea based on content
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleTranscribed = useCallback(
    (text: string) => {
      onChange(value ? `${value} ${text}` : text);
    },
    [value, onChange],
  );

  return (
    <div className="border-t border-border/40 bg-card/50 p-4">
      {/* Attachment indicators (above input when files are being extracted) */}
      {attachments.length > 0 && attachments.some(a => a.extracting) && (
        <div className="mx-auto mb-2 max-w-3xl">
          <span className="text-xs text-muted-foreground">
            ⏳ Extracting text from{' '}
            <span className="font-medium">
              {attachments.filter(a => a.extracting).map(a => a.name).join(', ')}
            </span>…
          </span>
        </div>
      )}

      {/* Render file attachments above the input */}
      {attachments.length > 0 && (
        <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center gap-2">
          {attachments.map((att) => (
            <AttachmentPreview
              key={att.name}
              attachment={att}
              onRemove={() => onRemoveAttachment(att.name)}
              extracting={att.extracting}
            />
          ))}
        </div>
      )}

      {/* Ephemeral context notice when files are attached */}
      {attachments.length > 0 && !attachments.some(a => a.extracting) && (
        <div className="mx-auto mb-2 max-w-3xl">
          <span className="text-[10px] text-muted-foreground/70">
            📎 {attachments.length} temporary file(s) — these will not be ingested into the
            permanent document base.
          </span>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2">
        {/* File Upload (Phase 6) */}
        <FileUploadButton
          attachments={attachments}
          onFileAttached={onFileAttached}
          onRemoveAttachment={onRemoveAttachment}
          disabled={disabled || attachments.length >= 10}
        />

        {/* Text input */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your QMS documents…"
            rows={1}
            className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-3 pr-12 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
            style={{ maxHeight: '120px' }}
          />
        </div>

        {/* Audio recorder */}
        <AudioRecorder
          onTranscribed={handleTranscribed}
          disabled={disabled}
        />

        {/* Send button */}
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
