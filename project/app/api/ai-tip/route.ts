// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

export async function POST(req: Request) {
  try {
    const { itemId, force } = await req.json();
    if (!itemId) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 讀 item + 取最多 3 張圖（public URL）
    const { data: item, error } = await sbAdmin
      .from('items')
      .select('id, title, raw_content, url, summary_tip, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    // 如果不強制且已有 summary_tip，可直接回傳（你也可選擇仍然重算）
    if (!force && item.summary_tip) {
      return NextResponse.json({ ok: true, tip: item.summary_tip, skipped: true });
    }

    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean).slice(0, 3) ?? [];

    // 系統提示 + 使用者內容
    const sysPrompt =
      '你是中文助理，輸出繁體中文、30 字內極簡摘要，需概括標題與內容重點；若有圖片或連結，須簡短提及圖像主題。不要贅字。';

    const baseText = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容：${item.raw_content.slice(0, 600)}` : '',
      item.url ? `連結：${item.url}` : '',
      images.length ? `（已附上 ${images.length} 張圖片作為參考）` : ''
    ].filter(Boolean).join('\n');

    // 多模態 user content：文字 + 多張 image_url
    const userContent: any[] = [{ type: 'text', text: baseText }];
    for (const url of images) {
      userContent.push({ type: 'image_url', image_url: { url } });
    }

    // 呼叫 OpenRouter (OpenAI 風格多模態)
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // 可換 openai/gpt-4o
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `openrouter_failed: ${JSON.stringify(data)}` },
        { status: 502 }
      );
    }

    let tip =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.text?.trim?.() ||
      '';

    if (tip.length > 60) tip = tip.slice(0, 60);

    const { error: upErr } = await sbAdmin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `db_update_failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, tip });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
