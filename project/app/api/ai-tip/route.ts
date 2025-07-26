// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 僅伺服器端使用（可繞過 RLS）
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawId = body?.itemId;
    const itemId = Number(rawId);

    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 讀資料 + 最多 3 張圖片
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean).slice(0, 3) ?? [];

    const sysPrompt =
      '你是中文助理，請輸出「繁體中文」30 字以內的極簡摘要，用最少字概括重點。若有圖片或連結，請簡要提及，不要廢話。';

    // 把圖片 URL 以文字方式加註，確保任何文字模型都能「看到」圖片線索。
    const imageLines =
      images.length > 0
        ? `圖片鏈結（最多 3 張）：\n${images.map((u, i) => `- [${i + 1}] ${u}`).join('\n')}`
        : '';

    const userPrompt =
      [
        item.title ? `標題：${item.title}` : '',
        item.raw_content ? `內容（節錄）：${item.raw_content.slice(0, 600)}` : '',
        item.url ? `連結：${item.url}` : '',
        imageLines,
      ]
        .filter(Boolean)
        .join('\n');

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // 可換成更強的多模態（費用會較高）
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 80,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `openrouter_failed: ${t}` },
        { status: 502 },
      );
    }

    const data = await resp.json();
    let tip: string =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.text?.trim?.() ||
      '';

    // 硬性截斷（中文約 30 字；以 60 字元保留完整詞彙）
    if (tip.length > 60) tip = tip.slice(0, 60);

    // 寫回 DB
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `db_update_failed: ${upErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, tip });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'unknown_error' },
      { status: 500 },
    );
  }
}
