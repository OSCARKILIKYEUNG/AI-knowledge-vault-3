// app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// 必須在環境變數設定：
// NEXT_PUBLIC_SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// OPENROUTER_API_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 伺服器端管理用（可略過 RLS）
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 讀取 item + 圖片
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, summary, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const images: string[] =
      // @ts-ignore - 關聯回來的 prompt_assets
      (item?.prompt_assets || []).map((a: any) => a?.image_url).filter(Boolean).slice(0, 3);

    // 準備提示（30字內；涵蓋標題/內容/圖片/連結）
    const sysPrompt =
      '你是中文助理，輸出繁體中文、30 字內的極簡摘要，需概括標題與內容重點，若有圖片或連結可簡短提及，不要贅字與標點裝飾。';

    const userPromptLines = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容：${String(item.raw_content).slice(0, 600)}` : '',
      item.url ? `連結：${item.url}` : '',
      images.length ? `圖片數：${images.length}` : '',
    ].filter(Boolean);

    const userPrompt = userPromptLines.join('\n');

    // 呼叫 OpenRouter（Gemini 2.5 Pro）
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${t}` }, { status: 502 });
    }

    const data = await resp.json();

    // 兼容多種回傳格式
    const rawContent =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      '';

    let tip = '';
    if (typeof rawContent === 'string') {
      tip = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      // e.g. [{type:'text', text:'...'}, ...]
      tip = rawContent.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('').trim();
    } else if (rawContent && typeof rawContent === 'object' && 'text' in rawContent) {
      tip = String((rawContent as any).text || '').trim();
    }

    // 保險裁切（中文約 30 字，這裡取 60 個字元避免怪切）
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
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
