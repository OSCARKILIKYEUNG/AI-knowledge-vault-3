import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'missing itemId' }, { status: 400 });

    // 取資料：標題、內容、第一張圖片
    const { data: item, error: itemErr } = await supabase
      .from('items')
      .select('id, title, raw_content, url')
      .eq('id', itemId)
      .single();
    if (itemErr || !item) return NextResponse.json({ error: 'item not found' }, { status: 404 });

    const { data: assets } = await supabase
      .from('prompt_assets')
      .select('image_url')
      .eq('item_id', itemId)
      .limit(1);

    const firstImage = assets?.[0]?.image_url || '';

    // 組 prompt：限制 30 字內，涵蓋圖片、內容、連結
    const userPrompt = `
請以最多 30 個中文字，極簡扼要總結此項目重點（可包含圖片/連結所指涉內容）。不要贅字，直述要點。
標題: ${item.title ?? ''}
連結: ${item.url ?? ''}
圖片: ${firstImage}
內容:
${(item.raw_content ?? '').slice(0, 1200)}
`;

    // Call OpenRouter（Gemini 2.5 Pro）
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro-exp-02-05',
        messages: [
          { role: 'system', content: '你是簡報助理，回覆必須在 30 個中文字以內。' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 100
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return NextResponse.json({ error: 'openrouter failed', detail: t }, { status: 500 });
    }

    const data = await resp.json();
    const tip: string =
      data?.choices?.[0]?.message?.content?.trim?.() ??
      data?.choices?.[0]?.message?.content ??
      '';

    // 寫回 items.summary_tip
    const { error: upErr } = await supabase
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);
    if (upErr) return NextResponse.json({ error: 'db update failed' }, { status: 500 });

    return NextResponse.json({ tip });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 });
  }
}
