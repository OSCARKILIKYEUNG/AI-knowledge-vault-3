// app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// === Env ===
// NEXT_PUBLIC_SUPABASE_URL        你的 Supabase URL
// SUPABASE_SERVICE_ROLE_KEY       Supabase Service Role Key（只在 Server 用）
// OPENROUTER_API_KEY              OpenRouter API Key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 用 Service Role，才能在伺服器端繞過 RLS 寫回 summary_tip
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawId = body?.itemId;
    const itemId = Number(rawId);

    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item + 圖片 URL（最多 3 張用來摘要）
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

    // === 準備訊息（OpenAI 相容格式，支援多模態） ===
    const systemText =
      '你是中文助理，輸出繁體中文，請用「30 字內」寫出極簡摘要；要概括標題與內容重點，如有圖片或連結請簡短提及。不要贅字、不要列表。';

    const baseTextParts = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容：${(item.raw_content || '').slice(0, 1200)}` : '',
      item.url ? `連結：${item.url}` : '',
      images.length ? `圖片數：${images.length}` : '',
    ].filter(Boolean);

    // user.content 以「文字 + image_url」陣列提供給 gpt-4o
    const userContent: any[] = [{ type: 'text', text: baseTextParts.join('\n') }];
    for (const url of images) {
      userContent.push({ type: 'image_url', image_url: { url } });
    }

    // === 呼叫 OpenRouter（gpt-4o） ===
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: userContent },
        ],
        max_tokens: 80,       // 控制在 30 字附近
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${t}` }, { status: 502 });
    }

    const data = await resp.json();

    // 解析回傳（可能是 string 或 content-array）
    let tip = '';
    const msg = data?.choices?.[0]?.message;

    if (typeof msg?.content === 'string') {
      tip = msg.content;
    } else if (Array.isArray(msg?.content)) {
      // 部分模型會回傳 content: [{type:'text', text:'...'}, ...]
      tip =
        msg.content
          .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
          .filter(Boolean)
          .join(' ')
          .trim() || '';
    }

    tip = (tip || '').trim();
    // 安全截斷（中文 30 字大概 ~60 code units）
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

// 避免被 Next.js 當作靜態資源快取
export const dynamic = 'force-dynamic';
