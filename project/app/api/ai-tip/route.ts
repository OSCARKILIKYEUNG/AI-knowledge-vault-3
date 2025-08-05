// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const visionModel   = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o';

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
export const dynamic = 'force-dynamic';

// 清洗：移除 URL / Markdown 連結或圖片語法，壓縮空白
function sanitizeTip(raw: string): string {
  if (!raw) return '';
  let s = raw;
  // ![alt](url) / [text](url)
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  s = s.replace(/\[[^\]]*\]\([^)]+\)/g, '');
  // 裸 URL
  s = s.replace(/https?:\/\/\S+/gi, '');
  // 移除多餘括號
  s = s.replace(/[()<>]/g, '');
  // 收斂空白
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

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

    // 撈 item + 圖片
    const { data: item, error } = await sb
      .from('items')
      .select(`
        id, title, raw_content, url,
        prompt_assets(image_url, storage_path)
      `)
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item not found' }, { status: 404 });
    }

    const title   = (item.title ?? '').trim();
    const content = (item.raw_content ?? '').trim();
    const link    = (item.url ?? '').trim();

    const assets = (item as any).prompt_assets ?? [];
    // 取最多 3~5 張可公開訪問的圖片 URL
    const imageUrls: string[] = assets
      .map((a: any) => a?.image_url)
      .filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, 4);

    const imageCount = imageUrls.length;
    const hasText    = (title + content + link).length > 0;
    const hasImages  = imageCount > 0;

    // ===== Prompt 規則（系統訊息）=====
    const system =
      '你是中文助手。請輸出繁體中文、單句、≤30 字的極簡摘要。' +
      '禁止輸出任何網址、禁止使用 Markdown 連結或圖片語法（例如 []() 或 ![]() ）。' +
      '若有圖片且亦有文字，請以文字重點為主，僅以「（附圖）」輕描淡寫提及，不要胡亂猜測圖像細節。' +
      '若只有圖片，僅做非常概括描述或以「附圖」帶過。';

    // ===== 使用多模態 content（OpenAI 風格）=====
    // content 是一個 array：可混合 text 與 image_url
    const contentParts: any[] = [];

    // 規則文字（根據三情境）
    if (hasImages && hasText) {
      // 情境 1：有圖 + 有文字 -> 文字為主、提及附圖
      const textBlock =
        [
          title ? `標題：${title}` : '',
          content ? `內容重點（節錄）：${content.slice(0, 600)}` : '',
          link ? `原始連結（僅供語意，不得輸出）：${link}` : '',
          `共有 ${imageCount} 張圖片已附上（模型可視圖判斷，但勿加入 URL）。`,
          '請以文字為主簡明總結；必要時以「（附圖）」收尾。'
        ].filter(Boolean).join('\n');
      contentParts.push({ type: 'text', text: textBlock });

      // 加入圖片
      for (const url of imageUrls) {
        contentParts.push({
          type: 'image_url',
          image_url: { url, detail: 'low' } // 用低細節以控制輸出簡短
        });
      }
    } else if (!hasImages && hasText) {
      // 情境 2：只有文字
      const textBlock =
        [
          title ? `標題：${title}` : '',
          content ? `內容重點（節錄）：${content.slice(0, 600)}` : '',
          link ? `原始連結（僅供語意，不得輸出）：${link}` : '',
          '請僅根據上述文字輸出單句 ≤30 字摘要；不得輸出 URL 或 Markdown。'
        ].filter(Boolean).join('\n');
      contentParts.push({ type: 'text', text: textBlock });
    } else {
      // 情境 3：只有圖片
      const textBlock =
        [
          `只有圖片（${imageCount} 張），無標題與內容。`,
          '請僅根據圖片做非常概括的描述；若不確定，僅以「附圖」帶過。',
          '輸出繁中單句 ≤30 字；不得輸出 URL 或 Markdown。'
        ].join('\n');
      contentParts.push({ type: 'text', text: textBlock });
      for (const url of imageUrls) {
        contentParts.push({
          type: 'image_url',
          image_url: { url, detail: 'low' }
        });
      }
    }

    // 呼叫 OpenRouter
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: visionModel, // 預設 openai/gpt-4o；可用 env 覆蓋
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: contentParts },
        ],
        max_tokens: 80,
        temperature: 0.2,
      }),
    });

    if (!orRes.ok) {
      const t = await orRes.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${t}` }, { status: 502 });
    }

    const orJson = await orRes.json();
    let tip: string =
      orJson?.choices?.[0]?.message?.content?.trim?.() ||
      orJson?.choices?.[0]?.text?.trim?.() ||
      '';

    // 後處理：清洗 + 截斷（60 字元 ≈ 30 中文）
    tip = sanitizeTip(tip);
    if (tip.length > 60) tip = tip.slice(0, 60);

    // 更新 DB
    const { error: upErr } = await sb.from('items').update({ summary_tip: tip }).eq('id', id);
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // 僅圖片時，回傳友善提示（前端可 toast）
    const clientHint = (!hasText && hasImages)
      ? '僅以圖片產生摘要；建議補 1～2 個關鍵字可更準確。'
      : undefined;

    return NextResponse.json({ ok: true, tip, message: clientHint });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
