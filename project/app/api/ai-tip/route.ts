// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey= process.env.OPENROUTER_API_KEY!;

// server-side client（Service Role 可繞過 RLS）
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }
    if (!openrouterKey) {
      return NextResponse.json({ ok: false, error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    // 讀 item + 圖片
    const { data: item, error } = await sb
      .from('items')
      .select('id,title,raw_content,url,prompt_assets(image_url)')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item not found' }, { status: 404 });
    }

    const title   = (item.title ?? '').trim();
    const content = (item.raw_content ?? '').trim();
    const link    = (item.url ?? '').trim();

    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean).slice(0, 3) ?? [];

    // 是否幾乎沒文字（只有圖片或內容超短）
    const hasEnoughText = (title + content + link).length >= 10;
    const clientHint = hasEnoughText
      ? undefined
      : '已僅以圖片（與可得的少量文字）產生摘要；建議補 1～2 個關鍵字可更準確。';

    // 把圖片 URL 明確傳給模型，請它根據圖片做判斷
    const sysPrompt =
      '你是中文助手，輸出繁體中文、30 字內的極簡摘要，需概括標題/內容重點，若有圖片或連結也簡短提及。不要加多餘贅字。';

    const lines: string[] = [];
    if (title)   lines.push(`標題：${title}`);
    if (content) lines.push(`內容：${content.slice(0, 600)}`);
    if (link)    lines.push(`連結：${link}`);
    if (images.length) {
      lines.push(`圖片 URLs：`);
      images.forEach((u, i) => lines.push(`- [${i + 1}] ${u}`));
      lines.push('請觀察圖片的主題、景物、動作或場景，融入摘要。');
    }

    const userPrompt =
      lines.length > 0
        ? lines.join('\n')
        : '僅有圖片可用，若能讀取圖片網址請描述其主題並統整成 30 字內要點。';

    // OpenRouter (GPT-4o mini)
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    if (!orRes.ok) {
      const t = await orRes.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${t}` }, { status: 502 });
    }

    const orJson = await orRes.json();
    let tip =
      orJson?.choices?.[0]?.message?.content?.trim?.() ||
      orJson?.choices?.[0]?.text?.trim?.() ||
      '';

    if (tip.length > 60) tip = tip.slice(0, 60); // 約 30 中文字

    const { error: upErr } = await sb
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tip, message: clientHint });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
