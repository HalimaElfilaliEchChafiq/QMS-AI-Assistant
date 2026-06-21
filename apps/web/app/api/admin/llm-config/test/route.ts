import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { CloudLLMProvider, OllamaLLMProvider } from '@kit/llm/client';

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

export async function POST(req: Request) {
  try {
    await verifyAdmin();
    const body = await req.json();
    const { deployment_mode, local_model, local_url, cloud_model, cloud_key } = body;

    let llm;
    if (deployment_mode === 'cloud') {
      if (!cloud_key) throw new Error('Cloud API key is required to test cloud mode');
      llm = new CloudLLMProvider({
        apiKey: cloud_key,
        model: cloud_model || 'gpt-4o',
      });
    } else {
      llm = new OllamaLLMProvider({
        baseUrl: local_url || 'http://127.0.0.1:11434',
        model: local_model || 'llama3:latest',
      });
    }

    // Send a ping to test the connection
    const response = await llm.chat([
      { role: 'user', content: 'Ping' }
    ], { maxTokens: 10 });

    return NextResponse.json({ success: true, message: response.content });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Connection test failed' },
      { status: 400 } // Return 400 so the UI can show the error gracefully
    );
  }
}
