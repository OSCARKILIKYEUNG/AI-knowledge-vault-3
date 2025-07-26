// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 僅伺服器端使用，繞過 RLS 寫入 embedding
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item（含圖片提示 summary_tip 一併）
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, summary, summary_tip, url, category')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // 整合要做 embedding 的文本（把 summary_tip 也塞進去，讓圖片描述能被索引）
    const embedText = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容：${item.raw_content}` : '',
      item.summary ? `AI摘要：${item.summary}` : '',
      item.summary_tip ? `圖片提示：${item.summary_tip}` : '',
      item.url ? `連結：${item.url}` : '',
      item.category?.length ? `分類：${item.category.join('、')}` : '',
    ].filter(Boolean).join('\n');

    // 產生向量（OpenRouter 的 embedding 端點）
    const embRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: embedText.slice(0, 8000), // 保險切長度
      }),
    });

    if (!embRes.ok) {
      const t = await embRes.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `embedding_failed: ${t}` }, { status: 502 });
    }

    const embJson = await embRes.json();
    const vector: number[] = embJson?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      return NextResponse.json({ ok: false, error: 'invalid_embedding' }, { status: 500 });
    }

    // 寫回 items.embedding
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ embedding: vector })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json({ ok: false, error: `db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
