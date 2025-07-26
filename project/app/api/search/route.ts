import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

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

    // 生成查詢向量（Cohere 1024）
    const er = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cohere/embed-multilingual-v3.0',
        input: query,
      }),
    });

    if (!er.ok) {
      const t = await er.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `embedding_failed: ${t}` }, { status: 502 });
    }

    const ej = await er.json();
    const qvec: number[] = ej?.data?.[0]?.embedding || ej?.data?.[0]?.embedding_float || [];
    if (!Array.isArray(qvec) || qvec.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_query_embedding' }, { status: 500 });
    }

    // 把有 embedding 的項目取回（含首張圖）
    const { data, error } = await admin
      .from('items')
      .select('*, prompt_assets(image_url)')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .limit(1000); // 視需要調整

    if (error) throw error;

    const list = (data || []).map((it: any) => {
      const score = cosine(qvec, it.embedding || []);
      // 如果標題含關鍵字，給一點加權
      const hit = (it.title || '').toLowerCase().includes(String(query).toLowerCase());
      return { ...it, __score: score + (hit ? 0.2 : 0) };
    });

    list.sort((a: any, b: any) => (b.__score ?? 0) - (a.__score ?? 0));
    const results = list.slice(0, 30); // 回傳前 30 筆

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
