// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const tipModel = process.env.OPENROUTER_TIP_MODEL || 'openai/gpt-4o-mini'; 
// 你也可以設成 'openai/gpt-4o' 或 'google/gemini-1.5-flash'（OpenRouter 供應的名稱）

const admin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

// 小工具：限制中文字數（保守用 60 個字元避免切字太奇怪，再二次收斂到 30）
function clampZh(s: string, hardLimit = 60, finalLimit = 30) {
  let out = (s || '').trim().replace(/\s+/g, '');
  if (out.length > hardLimit) out = out.slice(0, hardLimit);
  // 再嘗試壓到 30 字內
  if (out.length > finalLimit) out = out.slice(0, finalLimit);
  return out;
}

function notEnoughText(s?: string | null) {
  const t = (s || '').trim();
  // 少於 10 個字，就視為不足夠讓模型只靠文字理解
  return t.length < 10;
}

// 啟發式 fallback（API 失敗或完全沒有可用內容時）
function heuristicTip(opts: {
  title?: string | null;
  raw?: string | null;
  url?: string | null;
  cats?: string[] | null;
  images?: string[];
}) {
  const { title, raw, url, cats, images = [] } = opts;
  const hints: string[] = [];
  if (title) hints.push(title);
  if (raw) hints.push(raw);
  if (cats?.length) hints.push(cats.slice(0, 2).join('、'));
  if (images.length) hints.push(`${images.length} 張圖片`);
  if (url) hints.push('含連結');

  const base = hints.join('／') || '僅圖片，待補充內容';
  return clampZh(base);
}

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

    // 讀取 item + 圖片
    const { data: item, error } = await admin
      .from('items')
      .select('id, title, raw_content, url, category, summary, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const images: string[] =
      (item as any)?.prompt_assets?.map((a: any) => a?.image_url).filter(Boolean).slice(0, 3) ?? [];

    // 整理文字上下文
    const title = (item.title || '').trim();
    const raw = (item.raw_content || '').trim();
    const url = (item.url || '').trim();
    const cats: string[] = (item.category || []) as string[];

    const textIsShort = notEnoughText(title) && notEnoughText(raw);

    // === 構造多模態 messages ===
    const sys =
      '你是中文助理。請用繁體中文、30 字以內產生極簡摘要：' +
      '優先概括圖片主題；若無圖片，再概括文字重點；有連結可簡述用途。' +
      '禁止贅字與標點堆疊，直接給出內容重點。';

    // user content：若有圖片，採多模態；否則就是純文字。
    const parts: any[] = [];

    const textLines: string[] = [];
    if (!notEnoughText(title)) textLines.push(`標題：${title}`);
    if (!notEnoughText(raw)) textLines.push(`內容：${raw.slice(0, 600)}`);
    if (url) textLines.push(`連結：${url}`);
    if (cats?.length) textLines.push(`分類：${cats.join('、')}`);
    if (images.length) textLines.push(`圖片數：${images.length}`);

    // 如果文字過短或空，提示模型「請主要根據圖片理解」
    const textIntro =
      images.length && textIsShort
        ? '只有圖片或文字很短，請以圖片為主生成摘要。'
        : '以下是此項目的資訊：';

    parts.push({ type: 'text', text: `${textIntro}\n${textLines.join('\n')}` });

    // 加入圖片（若有）
    images.forEach((url) => {
      parts.push({
        type: 'image_url',
        image_url: { url },
      });
    });

    // === 呼叫 OpenRouter ===
    let tip = '';
    let usedModel = tipModel;

    try {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: usedModel,
          messages: [
            { role: 'system', content: sys },
            // 有圖片時，content 使用陣列 parts（多模態）
            { role: 'user', content: parts },
          ],
          temperature: 0.2,
          max_tokens: 80,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error?.message || `openrouter_failed_${resp.status}`);
      }

      tip =
        data?.choices?.[0]?.message?.content?.trim?.() ||
        data?.choices?.[0]?.text?.trim?.() ||
        '';

      // 收斂到 30 字以內
      tip = clampZh(tip);
    } catch (e) {
      // API 失敗 ⇒ 啟發式 fallback
      tip = heuristicTip({ title, raw, url, cats, images });
    }

    if (!tip) {
      tip = heuristicTip({ title, raw, url, cats, images });
    }

    // 寫回 DB
    const { error: upErr } = await admin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: `db_update_failed: ${upErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, tip, model: usedModel });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown_error' },
      { status: 500 }
    );
  }
}
