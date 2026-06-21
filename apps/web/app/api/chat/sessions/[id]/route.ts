/**
 * -------------------------------------------------------
 * API Route: Chat Session Detail
 * Étape 13 — GET /api/chat/sessions/[id] (messages)
 *             DELETE /api/chat/sessions/[id]
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// GET — Retrieve messages for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch session (RLS enforces ownership)
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id, title, language_mode, created_at')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('id, role, content, sources, confidence_level, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // Parse sources JSON strings
    const parsedMessages = (messages ?? []).map((m) => ({
      ...m,
      sources: typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources,
    }));

    return NextResponse.json({ session, messages: parsedMessages });
  } catch (err) {
    console.error('[API /api/chat/sessions/[id] GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — Delete a session (cascades to messages)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /api/chat/sessions/[id] DELETE] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
