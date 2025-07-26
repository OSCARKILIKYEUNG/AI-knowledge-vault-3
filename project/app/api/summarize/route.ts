// app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

// 伺服器端使用 Service Role 以便更新 items.summary_tip
const supabaseAdmin = createClient(supabaseUrl, serviceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId = Number(body?.itemId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item 與前三張圖片
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

    // ---- System 與 User 內容（強制包含圖片資訊）----
    const systemText =
      '你是中文助理，只能輸出繁體中文。「30 字內」寫出極簡摘要，需融合標題與文字重點。' +
      '※若有圖片，一定要在句末加上「（圖：關鍵詞）」；最多 2 個關鍵詞，以 / 分隔；每個關鍵詞 ≤ 6 字。' +
      '不要贅字、不要列點、不要換行。';

    const textLines = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容：${(item.raw_content || '').slice(0, 1200)}` : '',
      item.url ? `連結：${item.url}` : '',
      images.length ? `已附上 ${images.length} 張圖片，請一併理解畫面重點。` : '',
    ].filter(Boolean);

    // OpenAI/Chat Completions 多模態格式：content 可為陣列，含文字與 image_url
    const userContent: any[] = [{ type: 'text', text: textLines.join('\n') }];
    for (const url of images) {
      userContent.push({
        type: 'image_url',
        image_url: { url, detail: 'low' }, // low 可以節省 token，仍足夠抓主題
      });
    }

    // ---- 呼叫 OpenRouter（gpt-4o）----
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
        max_tokens: 80, // 30 字內，80 token 足夠
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_failed: ${t}` }, { status: 502 });
    }

    const data = await resp.json();
    // 解析 message.content（可能是 string 或分段陣列）
    let tip = '';
    const msg = data?.choices?.[0]?.message;

    if (typeof msg?.content === 'string') {
      tip = msg.content;
    } else if (Array.isArray(msg?.content)) {
      tip =
        msg.content
          .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
          .filter(Boolean)
          .join(' ')
          .trim() || '';
    }

    tip = (tip || '').trim();

    // 安全截斷（大概能涵蓋 30 字中文；避免切太奇怪用 60 code units）
    if (tip.length > 60) tip = tip.slice(0, 60);

    // 若有圖片但模型完全沒提到「圖：」，補一個最簡短尾註
    if (images.length > 0 && !/（圖：.+）/.test(tip)) {
      tip = `${tip}（圖：主題）`;
      if (tip.length > 60) tip = tip.slice(0, 60);
    }

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

export const dynamic = 'force-dynamic';
