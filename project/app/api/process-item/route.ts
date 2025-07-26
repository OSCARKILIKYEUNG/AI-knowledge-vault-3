import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const embedModel = process.env.OPENROUTER_EMBED_MODEL || 'mistralai/mistral-embed';
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from('items')
      .select('id, title, raw_content')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const text = [item.title, item.raw_content].filter(Boolean).join('\n');

    // 呼叫 OpenRouter embedding API
    const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embedModel,
        input: text,
      }),
    });

    const embeddingJson = await embeddingRes.json();

    if (!embeddingRes.ok || !embeddingJson?.data?.[0]?.embedding) {
      return NextResponse.json({
        ok: false,
        error: 'embedding_failed: ' + JSON.stringify(embeddingJson),
      }, { status: 502 });
    }

    const embedding = embeddingJson.data[0].embedding;

    const { error: updateErr } = await supabase
      .from('items')
      .update({ embedding })
      .eq('id', itemId);

    if (updateErr) {
      return NextResponse.json({ ok: false, error: 'db_update_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
