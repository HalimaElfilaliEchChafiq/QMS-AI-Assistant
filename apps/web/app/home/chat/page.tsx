'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Loader2, MessageSquare, Paperclip } from 'lucide-react';

import { ChatEmptyState } from '~/components/chat/chat-empty-state';
import { ChatInput } from '~/components/chat/chat-input';
import { ChatSidebar } from '~/components/chat/chat-sidebar';
import type { AttachedFile } from '~/components/chat/file-upload-button';
import { LanguageSelector } from '~/components/chat/language-selector';
import { MessageBubble } from '~/components/chat/message-bubble';
import type {
  ChatMessage,
  ChatSession,
  LanguageMode,
  Source,
} from '~/components/chat/types';

/**
 * -------------------------------------------------------
 * Chat Page — Main orchestrator
 * Phase 4 → Extended in Phase 6 (Étape 23)
 *
 * Composes all chat sub-components and manages:
 *   - Session CRUD (fetch, create, delete)
 *   - Message flow (send, receive, persist)
 *   - Language mode switching
 *   - Auto-scroll on new messages
 *   - [Phase 6] Audio transcription integration
 *   - [Phase 6] File attachment state management
 * -------------------------------------------------------
 */

export default function ChatPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [languageMode, setLanguageMode] =
    useState<LanguageMode>('source_language');

  // Phase 6: File attachment state (Array for up to 10 files)
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch sessions ─────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/chat/sessions');
      const data = await res.json();
      if (res.ok) setSessions(data.sessions || []);
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Load session messages ──────────────────────────────────────────────────
  const loadSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(
          (data.messages || []).map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as 'user' | 'assistant',
            content: m.content as string,
            sources: (m.sources as Source[]) || [],
            confidenceLevel: m.confidence_level as string | null,
            createdAt: m.created_at as string,
          })),
        );
        if (data.session?.language_mode) {
          setLanguageMode(data.session.language_mode as LanguageMode);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── New session ────────────────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setInputValue('');
    setAttachments([]);
  }, []);

  // ── Delete session ─────────────────────────────────────────────────────────
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await fetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
      if (activeSessionId === sessionId) {
        handleNewSession();
      }
      fetchSessions();
    },
    [activeSessionId, handleNewSession, fetchSessions],
  );

  // ── File attachment handlers (Phase 6) ─────────────────────────────────────
  const handleFileAttached = useCallback((attached: AttachedFile) => {
    setAttachments((prev) => {
      // Allow up to 10 files
      if (prev.length >= 10) return prev;
      // Remove any existing file with the same name if re-uploading
      const filtered = prev.filter(f => f.name !== attached.name);
      return [...filtered, attached];
    });
  }, []);

  const handleRemoveAttachment = useCallback((fileName: string) => {
    setAttachments((prev) => {
      const fileToRemove = prev.find(f => f.name === fileName);
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(f => f.name !== fileName);
    });
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || sending) return;

    setSending(true);
    setInputValue('');

    // Capture attachments info before clearing
    const currentAttachments = [...attachments];
    setAttachments([]);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      sources: [],
      confidenceLevel: null,
      createdAt: new Date().toISOString(),
      attachmentName: currentAttachments.length > 0 
        ? currentAttachments.map(a => a.name).join(', ') 
        : undefined,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId,
          languageMode,
          // Phase 6: include attachments context
          ...(currentAttachments.length > 0 && currentAttachments.some(a => a.extractedText)
            ? {
                attachmentContext: currentAttachments
                  .filter(a => a.extractedText)
                  .map(a => `[Document: ${a.name}]\n${a.extractedText}`)
                  .join('\n\n'),
                attachmentName: currentAttachments.map(a => a.name).join(', '),
              }
            : {}),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // If new session was created, update state
        if (!activeSessionId && data.sessionId) {
          setActiveSessionId(data.sessionId);
          fetchSessions();
        }

        // Add assistant response
        const assistantMsg: ChatMessage = {
          id: data.message.id || `resp-${Date.now()}`,
          role: 'assistant',
          content: data.message.content,
          sources: data.message.sources || [],
          confidenceLevel: data.message.confidenceLevel,
          createdAt: data.message.createdAt || new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Show error as assistant message
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error: ${data.error || 'Failed to get response'}`,
          sources: [],
          confidenceLevel: 'low',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content:
          '⚠️ Network error. Please check your connection and try again.',
        sources: [],
        confidenceLevel: 'low',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      // Clean up preview URLs
      currentAttachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    }
  }, [inputValue, sending, activeSessionId, languageMode, fetchSessions, attachments]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Suggestion click → prefill input ───────────────────────────────────────
  const handleSuggestionClick = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-1">
      {/* Sidebar */}
      {sidebarOpen && (
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          loading={loadingSessions}
          onSelectSession={loadSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold">
              {activeSessionId
                ? sessions.find((s) => s.id === activeSessionId)?.title ||
                  'Chat'
                : 'New Conversation'}
            </h1>
          </div>
          <LanguageSelector value={languageMode} onChange={setLanguageMode} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <ChatEmptyState onSuggestionClick={handleSuggestionClick} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {/* Show attachment indicator on user messages */}
                  {msg.attachmentName && msg.role === 'user' && (
                    <div className="mb-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      <span>{msg.attachmentName}</span>
                    </div>
                  )}
                  <MessageBubble msg={msg} />
                </div>
              ))}
              {sending && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                    AI
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border/30 bg-card px-4 py-3 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Searching documents & generating response…
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={sending}
          attachments={attachments}
          onFileAttached={handleFileAttached}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </div>
    </div>
  );
}
