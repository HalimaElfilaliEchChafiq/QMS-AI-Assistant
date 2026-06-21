/**
 * -------------------------------------------------------
 * API Route: Chat Sessions — List & Create
 * Étape 13 — GET /api/chat/sessions, POST /api/chat/sessions
 * -------------------------------------------------------
 */

import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// GET — List user's chat sessions
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, language_mode, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data });
  } catch (err) {
    console.error('[API /api/chat/sessions GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create new session
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = (body as { title?: string }).title || 'New Conversation';
    const languageMode = (body as { languageMode?: string }).languageMode || 'source_language';

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title, language_mode: languageMode })
      .select('id, title, language_mode, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (err) {
    console.error('[API /api/chat/sessions POST] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
