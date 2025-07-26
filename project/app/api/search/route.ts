// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleKey   = process.env.GOOGLE_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

async function getGeminiEmbedding(input: string): Promise<number[]> {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=' +
    encodeURIComponent(googleKey);

  const body = {
    model: 'models/text-embedding-004',
    content: { parts: [{ text: input }] },
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`gemini_failed: ${t}`);
  }

  const data = await resp.json();
  const values: number[] = data?.embedding?.value || data?.embedding?.values || [];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('gemini_empty_embedding');
  }
  return values;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export async function POST(req: Request) {
  try {
    const { query, userId, limit = 30 } = await req.json();
    if (!query || !userId) {
      return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 });
    }

    // 1) 取得查詢向量
    const qvec = await getGeminiEmbedding(query);

    // 2) 拿該使用者所有有 embedding 的項目（含首圖）
    const { data, error } = await admin
      .from('items')
      .select('*, prompt_assets(image_url)')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .limit(1000);

    if (error) throw error;

    // 3) 本地計算 cosine，相似度 + 標題命中加權
    const qLower = String(query).toLowerCase();
    const ranked = (data || []).map((it: any) => {
      const sim = cosine(qvec, it.embedding || []);
      const titleHit = (it.title || '').toLowerCase().includes(qLower) ? 0.2 : 0; // 額外加權
      return { ...it, __score: sim + titleHit };
    });

    ranked.sort((a: any, b: any) => (b.__score ?? 0) - (a.__score ?? 0));

    return NextResponse.json({
      ok: true,
      results: ranked.slice(0, Math.max(1, Math.min(100, Number(limit) || 30))),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
