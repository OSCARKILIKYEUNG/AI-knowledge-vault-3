// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: Request) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ ok: false, error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取最新 item + 圖片
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, summary, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const images: string[] =
      (item as any)?.prompt_assets?.map((a: any) => a?.image_url).filter(Boolean).slice(0, 3) ?? [];

    const sysPrompt =
      '你是中文助理，輸出繁體中文、30 字內的極簡摘要，需概括標題與內容重點；若有圖片或連結，簡短指出主題。不要加贅字。';

    const userPromptParts: string[] = [];
    if (item.title) userPromptParts.push(`標題：${item.title}`);
    if (item.raw_content) userPromptParts.push(`內容（截斷）：${(item.raw_content || '').slice(0, 600)}`);
    if (item.url) userPromptParts.push(`連結：${item.url}`);
    if (images.length) {
      userPromptParts.push('圖片 URL（最多三張）：');
      images.forEach((u, i) => userPromptParts.push(`圖${i + 1}：${u}`));
    }
    const userPrompt = userPromptParts.join('\n');

    // 呼叫 OpenRouter（gpt-4o）
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `openrouter_failed: ${data?.error?.message || ''}` },
        { status: 502 }
      );
    }

    let tip =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.text?.trim?.() ||
      '';

    // 最長保守切到 ~60 個字元，避免硬卡 30 造成斷詞太怪
    if (tip.length > 60) tip = tip.slice(0, 60);

    // 寫回 DB
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json({ ok: false, error: `db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tip });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
