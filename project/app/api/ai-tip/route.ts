import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    if (!openrouterKey) {
      return NextResponse.json({ ok: false, error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const { itemId } = (await req.json().catch(() => ({}))) as { itemId?: number };
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item + 取前幾張圖
    const { data: item, error } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'missing item' }, { status: 404 });
    }

    const title = (item.title ?? '').trim();
    const content = (item.raw_content ?? '').trim();
    const url = (item.url ?? '').trim();
    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean).slice(0, 4) ?? [];

    // 情境標記（用於附加提示訊息）
    const hasText = !!(title || content);
    const hasImages = images.length > 0;

    // 組多模態訊息
    const sys =
      '你是中文助理，輸出繁體中文的極簡提示，約 30～60 個中文字。' +
      '需先概括標題/內容重點；若有圖片，再以「[圖片]：」接一句簡述畫面。' +
      '不要輸出「提示：」字樣，不要貼任何 URL，不要 Markdown 連結。';

    const userParts: any[] = [];
    if (title) userParts.push({ type: 'text', text: `標題：${title}` });
    if (content) userParts.push({ type: 'text', text: `內容：${content.slice(0, 800)}` });
    if (url) userParts.push({ type: 'text', text: `連結：${url}` });
    if (hasImages) {
      userParts.push({ type: 'text', text: `圖片數：${images.length}` });
      for (const img of images) {
        userParts.push({ type: 'image_url', image_url: { url: img } });
      }
    }

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userParts },
        ],
        temperature: 0.3,
        max_tokens: 120,
      }),
    });

    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = raw?.error?.message || JSON.stringify(raw);
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${msg}` }, { status: resp.status });
    }

    let tip: string =
      raw?.choices?.[0]?.message?.content?.trim?.() ||
      raw?.choices?.[0]?.text?.trim?.() ||
      '';

    // 清理前綴，避免重覆「提示：」
    tip = tip
      .replace(/^\s*(提示|重點提示|摘要|重點摘要)\s*[:：]\s*/i, '')
      .replace(/\[圖片\]\([^)]+\)/g, '') // 移除奇怪的 Markdown 圖片連結
      .replace(/https?:\/\/\S+/g, '')    // 不要 URL
      .trim();

    // 依長度微調（但不強切）
    if (tip.length > 100) tip = tip.slice(0, 100);

    // 更新 DB
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', itemId);

    if (upErr) {
      return NextResponse.json({ ok: false, error: `db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    // 若僅有圖片無文字，回傳友善訊息供前端 toast
    const message = !hasText && hasImages
      ? '已僅以圖片產生提示；建議補 1～2 個關鍵字可更準確。'
      : undefined;

    return NextResponse.json({ ok: true, tip, message });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
