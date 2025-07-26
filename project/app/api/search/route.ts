// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

function cosine(a: number[], b: number[]) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export async function POST(req: Request) {
  try {
    const { query, userId } = await req.json();
    if (typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'missing query' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'missing userId' }, { status: 400 });
    }

    // 1) 取 query 的 embedding
    const eresp = await fetch('https://openrouter.ai/api/v1/embeddings', {
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
    const ej = await eresp.json();
    if (!eresp.ok || !ej?.data?.[0]?.embedding) {
      return NextResponse.json({ error: 'embed_failed', raw: ej }, { status: 502 });
    }
    const qvec: number[] = ej.data[0].embedding;

    // 2) 撈出該使用者的 items（含 embedding / 圖片 / 文字欄位）
    const { data, error } = await supabaseAdmin
      .from('items')
      .select('id, user_id, type, title, raw_content, url, summary, summary_tip, category, embedding, created_at, prompt_assets(image_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3) 在伺服器端計算 score（cosine + 關鍵字加權）
    const q = query.toLowerCase();
    const scored = (data || []).map((it: any) => {
      const emb: number[] | null = it.embedding || null;
      let sim = 0;
      if (Array.isArray(emb) && emb.length > 0) {
        sim = cosine(qvec, emb);
      }

      // 關鍵字加權：標題/內容/摘要/提示
      const text = [
        it.title || '',
        it.raw_content || '',
        it.summary || '',
        it.summary_tip || '',
        (it.prompt_assets || []).map((a: any) => a?.image_url || '').join(' ')
      ].join('\n').toLowerCase();

      let kw = 0;
      if (text.includes(q)) kw += 0.15; // 命中就加分
      if ((it.title || '').toLowerCase().includes(q)) kw += 0.1;

      const score = sim * 0.9 + kw; // 主要靠語意，關鍵字輔助
      return { ...it, _score: score };
    });

    // 4) 排序 + 取前 N 筆
    scored.sort((a, b) => b._score - a._score);
    const results = scored.slice(0, 30);

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
