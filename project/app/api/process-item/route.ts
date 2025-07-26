import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

// 依序嘗試（大小寫與斜線要正確）
const EMBEDDING_CANDIDATES = [
  'google/text-embedding-004',       // Google 官方 embedding（多語佳，常可用）
  'voyage/voyage-3-lite',            // Voyage 多語向量（常可用）
  'nomic-ai/nomic-embed-text-v1.5',  // Nomic 向量
  'jinaai/jina-embeddings-v3',       // Jina 多語
  'snowflake/arctic-embed-l-v2.0',   // Snowflake Arctic 向量
];

async function getEmbeddingByOpenRouter(input: string) {
  let lastErr = '';
  const tried: string[] = [];

  for (const model of EMBEDDING_CANDIDATES) {
    tried.push(model);
    try {
      const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input }),
      });
      if (!r.ok) {
        lastErr = await r.text().catch(() => '');
        continue;
      }
      const j = await r.json();
      const vec: number[] =
        j?.data?.[0]?.embedding ||
        j?.data?.[0]?.embedding_float ||
        [];
      if (Array.isArray(vec) && vec.length > 0) {
        return { embedding: vec, model, tried };
      }
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
    }
  }

  throw new Error(`All models failed. tried=${tried.join(', ')} last=${lastErr}`);
}

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    const { data: item, error } = await admin
      .from('items')
      .select('id, title, raw_content, url, category')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    const embedText = [
      item.title || '',
      item.raw_content || '',
      item.url || '',
      (item.category || []).join(' ')
    ].filter(Boolean).join('\n');

    if (!embedText.trim()) {
      await admin.from('items').update({ embedding: null }).eq('id', id);
      return NextResponse.json({ ok: true, message: 'empty_content' });
    }

    const { embedding, model, tried } = await getEmbeddingByOpenRouter(embedText);

    const { error: upErr } = await admin
      .from('items')
      .update({ embedding })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dim: embedding.length, model, tried });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
