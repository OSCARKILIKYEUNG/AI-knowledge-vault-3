import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

const EMBEDDING_CANDIDATES = [
  'google/text-embedding-004',
  'voyage/voyage-3-lite',
  'nomic-ai/nomic-embed-text-v1.5',
  'jinaai/jina-embeddings-v3',
  'snowflake/arctic-embed-l-v2.0',
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
      if (!r.ok) { lastErr = await r.text().catch(() => ''); continue; }
      const j = await r.json();
      const vec: number[] =
        j?.data?.[0]?.embedding ||
        j?.data?.[0]?.embedding_float ||
        [];
      if (Array.isArray(vec) && vec.length > 0) return { embedding: vec, model, tried };
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
    }
  }
  throw new Error(`All models failed. tried=${tried.join(', ')} last=${lastErr}`);
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export async function POST(req: Request) {
  try {
    const { query, userId } = await req.json();
    if (!query || !userId) {
      return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 });
    }

    const { embedding: qvec, model, tried } = await getEmbeddingByOpenRouter(query);

    const { data, error } = await admin
      .from('items')
      .select('*, prompt_assets(image_url)')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw error;

    const list = (data || []).map((it: any) => {
      const score = cosine(qvec, it.embedding || []);
      const titleHit = (it.title || '').toLowerCase().includes(String(query).toLowerCase());
      return { ...it, __score: score + (titleHit ? 0.2 : 0) };
    });

    list.sort((a: any, b: any) => (b.__score ?? 0) - (a.__score ?? 0));
    return NextResponse.json({ ok: true, model, tried, results: list.slice(0, 30) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
