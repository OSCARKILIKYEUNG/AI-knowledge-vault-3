// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const { q, userId, mode = 'hybrid', limit = 24 } = await req.json();

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 });
    }
    if (!q || typeof q !== 'string') {
      return NextResponse.json({ ok: false, error: 'missing query' }, { status: 400 });
    }

    const results: any[] = [];
    const seen = new Set<number>();

    // ---- 1) 關鍵字搜尋（標題 + 內容 + 摘要 + 圖片提示）----
    const doKeyword = async () => {
      const { data, error } = await supabaseAdmin
        .from('items')
        .select('*, prompt_assets(image_url)')
        .eq('user_id', userId)
        .or(`title.ilike.%${q}%,raw_content.ilike.%${q}%,summary.ilike.%${q}%,summary_tip.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        for (const it of data) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            // keyword 沒有 similarity，就先塞 0
            results.push({ ...it, similarity: 0 });
          }
        }
      }
    };

    // ---- 2) 向量語义搜尋（embedding）----
    const doSemantic = async () => {
      // 產 query embedding
      const embRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: q.slice(0, 8000),
        }),
      });

      if (!embRes.ok) return;
      const embJson = await embRes.json();
      const qvec: number[] = embJson?.data?.[0]?.embedding;
      if (!Array.isArray(qvec)) return;

      // 呼叫 RPC 取最相近的若干筆
      const { data: matched, error: rpcErr } = await supabaseAdmin
        .rpc('match_items', { query_embedding: qvec, match_count: limit });

      if (rpcErr || !matched) return;

      // 只保留該使用者的（若 RLS 沒替你擋掉的話）
      const ids = matched.map((m: any) => m.id);
      const { data: items } = await supabaseAdmin
        .from('items')
        .select('*, prompt_assets(image_url)')
        .in('id', ids)
        .eq('user_id', userId);

      // 用相似度排序（matched 的順序就是相似度排序）
      const byId = new Map(items?.map((x: any) => [x.id, x]) ?? []);
      for (const m of matched) {
        const it = byId.get(m.id);
        if (it && !seen.has(it.id)) {
          seen.add(it.id);
          results.push({ ...it, similarity: m.similarity ?? 0 });
        }
      }
    };

    if (mode === 'keyword') {
      await doKeyword();
    } else if (mode === 'semantic') {
      await doSemantic();
    } else {
      await Promise.all([doKeyword(), doSemantic()]);
    }

    // Hybrid：依 similarity 排序（有 similarity 的在前），再以時間為次要排序
    results.sort((a, b) => {
      if (b.similarity !== a.similarity) return (b.similarity || 0) - (a.similarity || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ ok: true, items: results.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
