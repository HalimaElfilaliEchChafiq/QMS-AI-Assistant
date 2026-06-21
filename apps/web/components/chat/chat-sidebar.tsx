'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';

import type { ChatSession } from './types';

/**
 * -------------------------------------------------------
 * Chat Sidebar Component
 * Phase 4 — Session list with create/delete
 *
 * Displays all chat sessions for the current user, sorted
 * by most recently updated. Supports creating new sessions
 * and deleting existing ones.
 * -------------------------------------------------------
 */

export function ChatSidebar({
  sessions,
  activeSessionId,
  loading,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-border/40 bg-card/30">
      <div className="flex items-center justify-between border-b border-border/40 p-3">
        <h2 className="text-sm font-semibold">Conversations</h2>
        <button
          onClick={onNewSession}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet. Start a new one!
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activeSessionId === session.id
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <button
                onClick={() => onSelectSession(session.id)}
                className="flex flex-1 flex-col items-start truncate"
              >
                <span className="truncate font-medium">
                  {session.title}
                </span>
                <span className="text-[10px] opacity-60">
                  {new Date(
                    session.updated_at || session.created_at,
                  ).toLocaleDateString('fr-FR')}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
