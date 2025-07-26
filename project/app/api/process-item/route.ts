// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    if (!itemId) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 讀取 item + 圖片（為摘要提供上下文；embedding 只用文字）
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, summary, category, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // === 1) 產生文字摘要（用 gpt-4o，透過 OpenRouter Chat Completions） ===
    let summary = item.summary || '';
    try {
      const sys = '請以繁體中文，產生 1～2 句的重點摘要，簡潔且不超過 80 字。';
      const user = [
        item.title ? `標題：${item.title}` : '',
        item.raw_content ? `內容（節錄）：${item.raw_content.slice(0, 1200)}` : '',
        item.url ? `連結：${item.url}` : '',
        (item as any).prompt_assets?.length ? `圖片數：${(item as any).prompt_assets.length}` : '',
      ].filter(Boolean).join('\n');

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user }
          ],
          max_tokens: 120,
          temperature: 0.3
        }),
      });
      const j = await resp.json();
      if (resp.ok) {
        summary =
          j?.choices?.[0]?.message?.content?.trim?.() ||
          j?.choices?.[0]?.text?.trim?.() ||
          summary;
      }
    } catch {}

    // === 2) 產生 Embedding（Cohere embed v3 multilingual） ===
    let embedding: number[] | null = null;
    try {
      const textForEmbedding =
        [item.title, item.raw_content, item.summary].filter(Boolean).join('\n').slice(0, 3000);

      if (textForEmbedding) {
        const eresp = await fetch('https://openrouter.ai/api/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'cohere/embed-multilingual-v3.0',
            input: textForEmbedding,
          }),
        });
        const ej = await eresp.json();
        if (eresp.ok && ej?.data?.[0]?.embedding) {
          embedding = ej.data[0].embedding;
        }
      }
    } catch {}

    // === 3) 寫回資料庫 ===
    await supabaseAdmin
      .from('items')
      .update({
        summary: summary || null,
        embedding: embedding || null, // items.embedding 欄位型別：float8[] 或 vector 皆可
      })
      .eq('id', itemId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
