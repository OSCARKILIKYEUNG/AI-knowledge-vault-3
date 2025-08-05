// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 伺服器端 Supabase（可繞 RLS）
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

// 小工具：清理模型輸出（移除 URL、Markdown、壓縮空白）
function cleanText(s: string): string {
  let t = s ?? '';
  // 移除 markdown link / image
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  t = t.replace(/\[[^\]]*\]\([^)]+\)/g, '');
  // 移除 http/https 連結
  t = t.replace(/https?:\/\/\S+/g, '');
  // 壓縮多餘空白
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\s*\n\s*/g, ' ').trim();
  return t;
}

// 取前 n 個中文字（保守用字元數控制，避免過長）
function clip(s: string, n: number) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n);
}

export async function POST(req: Request) {
  try {
    if (!openrouterKey) {
      return NextResponse.json({ ok: false, error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const rawId = body?.itemId;
    const itemId = Number(rawId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 把 items 與 prompt_assets 讀出來
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, summary_tip, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const title: string = item.title ?? '';
    const content: string = item.raw_content ?? '';
    const imgs: string[] =
      (item as any)?.prompt_assets?.map((a: any) => a?.image_url).filter(Boolean).slice(0, 3) ?? [];

    const hasText = Boolean((title && title.trim()) || (content && content.trim()));
    const hasImages = imgs.length > 0;

    // 建立多模態 messages
    // 使用 OpenAI/Chat 格式：content 是 array，可混合 text + image_url
    const systemText =
      '你是專業的繁體中文助理。輸出純文字（不可含連結或 Markdown），總長度精簡，必須依照下述「輸出格式規則」。';

    // 根據三種情境給不同的「明確格式規則」
    let formatRule = '';
    if (hasImages && hasText) {
      formatRule =
        '輸出格式：\n' +
        '提示：<用 30~60 字描述標題/內容重點>。[圖片]：<用 8~20 字描述圖片關鍵畫面>\n' +
        '禁止使用 Markdown、禁止輸出任何連結或 URL。';
    } else if (!hasImages && hasText) {
      formatRule =
        '輸出格式：\n' +
        '提示：<用 30~60 字描述標題/內容重點>\n' +
        '禁止使用 Markdown、禁止輸出任何連結或 URL。';
    } else {
      // 只有圖片
      formatRule =
        '輸出格式：\n' +
        '[圖片]：<用 10~20 字描述圖片關鍵畫面>（建議補標題或內容以更精準）\n' +
        '禁止使用 Markdown、禁止輸出任何連結或 URL。';
    }

    // 準備 user 內容
    const textLines: string[] = [];
    if (title) textLines.push(`標題：${clip(title, 200)}`);
    if (content) textLines.push(`內容：${clip(content, 800)}`);
    // url 與 category 不直接給，避免模型想貼連結

    // 多模態 content（先輸入文字，再附圖）
    const userContent: Array<any> = [];
    const joinedText = textLines.join('\n').trim();
    if (joinedText) {
      userContent.push({ type: 'text', text: joinedText });
    }
    if (hasImages) {
      imgs.forEach((u) => userContent.push({ type: 'image_url', image_url: { url: u } }));
    }

    // 呼叫 OpenRouter（gpt-4o，支援 vision）
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: systemText + '\n' + formatRule },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 160,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${msg}` }, { status: 502 });
    }

    // 擷取與清理
    let tip: string =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.text?.trim?.() ||
      '';
    tip = cleanText(tip);

    // 保險：若模型沒照格式，這裡做最低限度修正
    if (hasImages && hasText) {
      // 若沒包含「提示：」或「[圖片]：」，簡單補齊
      if (!/提示：/.test(tip)) {
        const textPart = clip(joinedText || '（無文字）', 60);
        tip = `提示：${textPart}。[圖片]：圖片展示重點場景`;
      }
      if (!/\[圖片]：/.test(tip)) {
        tip = tip.replace(/。?$/, '。') + '[圖片]：圖片展示重點場景';
      }
    } else if (!hasImages && hasText) {
      if (!/提示：/.test(tip)) {
        const textPart = clip(joinedText || '（無文字）', 60);
        tip = `提示：${textPart}`;
      }
      // 移除任何莫名的圖片段
      tip = tip.replace(/\[圖片]：.*$/, '').trim();
    } else {
      // 只有圖片
      if (!/\[圖片]：/.test(tip)) {
        tip = `[圖片]：圖片展示重點場景（建議補標題或內容以更精準）`;
      }
      // 只保留圖片段
      tip = tip.replace(/提示：.*?(?=\[圖片]：|$)/, '').trim();
    }

    // 最後再做一次清理與長度保險
    tip = cleanText(tip);
    tip = clip(tip, 140); // 約限制 140 字內（卡片會截斷，詳情頁顯示完整）

    // 寫回 DB
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `db_update_failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    // 附帶友善訊息：若只有圖片，提示使用者可補文
    const message = !hasText && hasImages
      ? '僅以圖片產生摘要；建議之後補標題或內容可更精準。'
      : undefined;

    return NextResponse.json({ ok: true, tip, message });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'unknown_error' },
      { status: 500 }
    );
  }
}
