import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取資料
    const { data: item, error } = await admin
      .from('items')
      .select('id, title, raw_content, url, category')
      .eq('id', id)
      .single();
    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // 要嵌入的文字（標題 + 內容 + 連結 + 分類）
    const embedText = [
      item.title || '',
      item.raw_content || '',
      item.url || '',
      (item.category || []).join(' ')
    ].filter(Boolean).join('\n');

    if (!embedText.trim()) {
      // 空白內容也允許：把欄位清空
      await admin.from('items').update({ embedding: null }).eq('id', id);
      return NextResponse.json({ ok: true, message: 'empty_content' });
    }

    // 向 OpenRouter 取嵌入（Cohere 1024 維）
    const er = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cohere/embed-multilingual-v3.0',
        input: embedText,
      }),
    });

    if (!er.ok) {
      const t = await er.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `embedding_failed: ${t}` }, { status: 502 });
    }

    const ej = await er.json();
    const embedding: number[] =
      ej?.data?.[0]?.embedding || ej?.data?.[0]?.embedding_float || [];

    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_embedding' }, { status: 500 });
    }

    // 存回 DB（建議 items.embedding 為 float8[] 或 vector(1024)）
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
