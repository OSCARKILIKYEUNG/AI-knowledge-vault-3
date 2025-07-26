import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

// 依序嘗試這些 embedding 模型（OpenRouter）
const EMBEDDING_CANDIDATES = [
  'voyage/voyage-3-lite',          // 1536 維，快速、泛用
  'snowflake/arctic-embed-l-v2.0',  // 1024 維，多語
  'nomic-ai/nomic-embed-text-v1.5', // 768 維，多語
  'jinaai/jina-embeddings-v3',      // 多語
  'cohere/embed-multilingual-v3.0', // 有些金鑰不可用
];

async function getEmbeddingByOpenRouter(input: string): Promise<number[]> {
  let lastErr = '';
  for (const model of EMBEDDING_CANDIDATES) {
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
      if (Array.isArray(vec) && vec.length > 0) return vec;
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
    }
  }
  throw new Error(`All models failed. last=${lastErr}`);
}

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item
    const { data: item, error } = await admin
      .from('items')
      .select('id, title, raw_content, url, category')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // 準備要嵌入的文字
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

    // 產生向量（多模型備援）
    const embedding = await getEmbeddingByOpenRouter(embedText);

    // 存回 DB（建議 items.embedding 型別為 float8[]）
    const { error: upErr } = await admin
      .from('items')
      .update({ embedding })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dim: embedding.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
