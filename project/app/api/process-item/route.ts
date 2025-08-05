// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 伺服器端 Supabase（可繞 RLS）
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

// ====== 工具 ======
function cleanText(s: string): string {
  let t = s ?? '';
  // 移除 markdown 圖片 / 連結
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  t = t.replace(/\[[^\]]*\]\([^)]+\)/g, '');
  // 移除 http/https 連結
  t = t.replace(/https?:\/\/\S+/g, '');
  // 壓縮空白與換行
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\s*\n\s*/g, '\n').trim();
  return t;
}
function clip(s: string, n: number) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n);
}

// ====== 主處理 ======
export async function POST(req: Request) {
  try {
    if (!openrouterKey) {
      return NextResponse.json({ ok: false, error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取資料：項目 + 圖片
    const { data: item, error: qErr } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, summary, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (qErr || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const title: string = item.title ?? '';
    const content: string = item.raw_content ?? '';
    const imgs: string[] =
      (item as any)?.prompt_assets?.map((a: any) => a?.image_url).filter(Boolean).slice(0, 4) ?? [];

    const hasText = Boolean((title && title.trim()) || (content && content.trim()));
    const hasImages = imgs.length > 0;

    // ====== 指令設計：三種情境固定格式 ======
    let formatRule = '';
    if (hasImages && hasText) {
      // 有圖 + 有文字
      formatRule =
        '請以繁體中文輸出，純文字（禁止連結與 Markdown）。\n' +
        '結構與長度要求：\n' +
        '重點摘要：80~200 字，條理清楚，概括標題與內容重點，避免流水帳。\n' +
        '圖片重點：一句話描述圖片的主體、場景或動作（8~25 字）。\n' +
        '輸出範例：\n' +
        '重點摘要：……（80~200 字）\n' +
        '圖片重點：……（8~25 字）';
    } else if (!hasImages && hasText) {
      // 只有文字
      formatRule =
        '請以繁體中文輸出，純文字（禁止連結與 Markdown）。\n' +
        '結構與長度要求：\n' +
        '重點摘要：120~240 字，條理清楚，概括標題與內容重點，避免流水帳。\n' +
        '輸出範例：\n' +
        '重點摘要：……（120~240 字）';
    } else {
      // 只有圖片
      formatRule =
        '請以繁體中文輸出，純文字（禁止連結與 Markdown）。\n' +
        '結構與長度要求：\n' +
        '圖片重點：一句話描述圖片的主體、場景或動作（10~25 字）。\n' +
        '在最後補一句友善提示：「（建議補標題或內容以更精準）」。\n' +
        '輸出範例：\n' +
        '圖片重點：……（10~25 字）\n' +
        '（建議補標題或內容以更精準）';
    }

    // ====== 準備多模態內容 ======
    const textBlocks: string[] = [];
    if (title) textBlocks.push(`標題：${clip(title, 300)}`);
    if (content) textBlocks.push(`內容：${clip(content, 1500)}`);

    const userContent: Array<any> = [];
    if (textBlocks.length) {
      userContent.push({ type: 'text', text: textBlocks.join('\n') });
    }
    if (hasImages) {
      imgs.forEach((url) => {
        userContent.push({ type: 'image_url', image_url: { url } });
      });
    }

    // ====== 呼叫 OpenRouter (gpt-4o) ======
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              '你是專業的繁體中文助理，擅長將長段內容與圖片資訊整理為精煉摘要。' +
              '輸出必須符合指定的格式與長度，且為純文字（不得包含連結或 Markdown）。\n' +
              formatRule,
          },
          { role: 'user', content: userContent.length ? userContent : [{ type: 'text', text: '（無文字與圖片）' }] },
        ],
        temperature: 0.2,
        max_tokens: 420,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${msg}` }, { status: 502 });
    }

    let longSummary: string =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.text?.trim?.() ||
      '';

    longSummary = cleanText(longSummary);

    // ====== 最低限度格式修正（避免模型沒跟格式） ======
    if (hasImages && hasText) {
      if (!/重點摘要：/.test(longSummary)) {
        const fallback = clip((title || content || '（無文字）').replace(/\s+/g, ' '), 160);
        longSummary = `重點摘要：${fallback}\n圖片重點：圖片呈現主體與場景`;
      }
      if (!/圖片重點：/.test(longSummary)) {
        longSummary = longSummary.replace(/\s*$/, '') + `\n圖片重點：圖片呈現主體與場景`;
      }
    } else if (!hasImages && hasText) {
      if (!/重點摘要：/.test(longSummary)) {
        const fallback = clip((title || content || '（無文字）').replace(/\s+/g, ' '), 220);
        longSummary = `重點摘要：${fallback}`;
      }
      // 移除任何圖片段
      longSummary = longSummary.replace(/圖片重點：.*$/, '').trim();
    } else {
      // 只有圖片
      if (!/圖片重點：/.test(longSummary)) {
        longSummary = `圖片重點：圖片呈現主體與場景\n（建議補標題或內容以更精準）`;
      }
      // 確保包含友善提示
      if (!/建議補標題或內容/.test(longSummary)) {
        longSummary += `\n（建議補標題或內容以更精準）`;
      }
      // 移除任何「重點摘要」
      longSummary = longSummary.replace(/重點摘要：.*?(?=圖片重點：|$)/s, '').trim();
    }

    // 最後保險：長度限制（避免過長）
    longSummary = clip(longSummary, 1000);

    // ====== 寫回 DB ======
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary: longSummary })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `db_update_failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    // 只有圖片時，回前端帶個友善訊息
    const message =
      !hasText && hasImages
        ? '僅以圖片產生長摘要；建議補標題或內容以更精準。'
        : undefined;

    return NextResponse.json({ ok: true, summary: longSummary, message });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'unknown_error' },
      { status: 500 }
    );
  }
}
