import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const EMBED_MODEL = 'cohere/embed-multilingual-v3.0';
const supabaseAdmin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

function cosineSim(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query  = String(body?.query ?? '');
    const userId = String(body?.userId ?? '');
    if (!query.trim() || !userId) {
      return NextResponse.json({ ok: false, error: 'missing query or userId' }, { status: 400 });
    }

    // 1) query -> embedding
    const embResp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    });
    if (!embResp.ok) {
      const t = await embResp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `embedding_failed: ${t}` }, { status: 502 });
    }
    const embJson = await embResp.json();
    const qvec: number[] = embJson?.data?.[0]?.embedding ?? [];
    if (!Array.isArray(qvec) || qvec.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_embedding' }, { status: 500 });
    }

    // 2) 抓使用者 items（有 embedding）
    const { data: rows, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, summary, summary_tip, category, created_at, embedding, prompt_assets(image_url)')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      return NextResponse.json({ ok: false, error: `db_read_failed: ${error.message}` }, { status: 500 });
    }

    // 3) 伺服器端 cosine 排序
    const withScore = (rows ?? []).map((r: any) => ({ ...r, _score: cosineSim(qvec, r.embedding ?? []) }));
    withScore.sort((a, b) => b._score - a._score);

    return NextResponse.json({ ok: true, results: withScore.slice(0, 50) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
