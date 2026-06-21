import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

async function verifyAdmin() {
  const userClient = getSupabaseServerClient();
  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: account } = await userClient
    .from('accounts')
    .select('role')
    .eq('id', user.id)
    .single();

  if (account?.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }

  return user;
}

export async function GET() {
  try {
    await verifyAdmin();

    const adminClient = getSupabaseServerAdminClient();
    const { data, error } = await (adminClient as any)
      .from('llm_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Fallback if table is empty
      return NextResponse.json({
        deployment_mode: process.env.DEPLOYMENT_MODE || 'local',
        local_model: 'llama3:latest',
        local_url: 'http://127.0.0.1:11434',
        cloud_model: process.env.CLOUD_LLM_MODEL || 'gpt-4o',
        cloud_key: '',
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch LLM config' },
      { status: error.message === 'Unauthorized' ? 401 : error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdmin();
    const body = await req.json();

    const adminClient = getSupabaseServerAdminClient();
    
    // We upsert row id=1
    const { data, error } = await (adminClient as any)
      .from('llm_config')
      .upsert({
        id: 1,
        deployment_mode: body.deployment_mode,
        local_model: body.local_model,
        local_url: body.local_url,
        cloud_model: body.cloud_model,
        cloud_key: body.cloud_key,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, config: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update LLM config' },
      { status: error.message === 'Unauthorized' ? 401 : error.message.includes('Forbidden') ? 403 : 500 }
    );
  }
}
