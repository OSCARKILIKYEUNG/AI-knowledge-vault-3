// app/api/ai-tip/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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

    /* ---------- 取 item + 圖片 ---------- */
    const { data: item, error } = await sb
      .from('items')
      .select('id,title,raw_content,url,summary_tip,prompt_assets(image_url)')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item not found' }, { status: 404 });
    }

    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean).slice(0, 3) ?? [];

    const titlePart   = (item.title ?? '').trim();
    const contentPart = (item.raw_content ?? '').trim();
    const linkPart    = (item.url ?? '').trim();

    /* ---------- 檢查輸入長度 ---------- */
    const hasText = (titlePart + contentPart + linkPart).length >= 10;
    let clientHint = '';

    if (!hasText) {
      // 只有圖片或文字過短
      clientHint = '已僅以圖片產生摘要；建議補 1～2 個關鍵字可更準確。';
    }

    /* ---------- 組 Prompt ---------- */
    const sysPrompt =
      '你是中文助手，輸出繁體中文、30 字內的極簡摘要，需概括標題/內容重點，若有圖片或連結也簡短提及。不要加任何多餘贅字。';

    const userPrompt = [
      titlePart   && `標題：${titlePart}`,
      contentPart && `內容：${contentPart.slice(0, 600)}`,
      linkPart    && `連結：${linkPart}`,
      images.length ? `圖片數：${images.length}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    /* ---------- 呼叫 OpenRouter (GPT-4o) ---------- */
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method : 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({
        model   : 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user',   content: userPrompt || '僅有圖片，請描述圖片可能內容並統整' },
        ],
        max_tokens : 80,
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

    // 安全切到 60 個字元（中文約 30 字）
    if (tip.length > 60) tip = tip.slice(0, 60);

    /* ---------- 更新 DB ---------- */
    const { error: upErr } = await sb
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tip, message: clientHint || undefined });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
