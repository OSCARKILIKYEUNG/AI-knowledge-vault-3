// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

// 讓此路由永遠動態執行
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 讀資料
    const { data: item, error } = await supabase
      .from('items')
      .select('id, title, raw_content, url, category')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // 準備要嵌入的文字（標題 + 內容 + 類別 + 連結）
    const textForEmbed = [
      item.title || '',
      item.raw_content || '',
      Array.isArray(item.category) ? item.category.join('、') : '',
      item.url || ''
    ].filter(Boolean).join('\n');

    // 產生嵌入（OpenRouter / Embeddings）
    const embResp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cohere/embed-multilingual-v3.0', // 1024 維
        input: textForEmbed || 'empty',
      }),
    });

    if (!embResp.ok) {
      const t = await embResp.text().catch(()=>'');
      return NextResponse.json({ ok:false, error: `embedding_failed: ${t}` }, { status: 502 });
    }

    const embJson = await embResp.json();
    const embedding: number[] =
      embJson?.data?.[0]?.embedding ||
      embJson?.results?.[0]?.embedding ||
      [];

    // 寫回資料庫（建議欄位型別為 float8[]）
    const { error: upErr } = await supabase
      .from('items')
      .update({ embedding })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok:false, error: `db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dim: embedding.length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
