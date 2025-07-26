// app/api/embed/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

// 呼叫 openrouter 的 embedding API（以 gpt-4o 為例）
async function createEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-2024-05-13',
      input: text,
    }),
  });

  if (!res.ok) throw new Error('Failed to create embedding');
  const data = await res.json();
  return data.data[0].embedding;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemId = Number(body?.itemId);

    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'Missing itemId' }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from('items')
      .select('id, title, raw_content')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 });
    }

    const text = [item.title, item.raw_content].filter(Boolean).join('\n').slice(0, 1000);
    const embedding = await createEmbedding(text);

    const { error: updateError } = await supabase
      .from('items')
      .update({ embedding })
      .eq('id', itemId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
