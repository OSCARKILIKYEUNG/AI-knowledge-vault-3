// app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok:false, error:'missing itemId' }, { status: 400 });
    }

    // 讀 item + 圖片 URL
    const { data, error } = await supabase
      .from('items')
      .select('id, title, raw_content, url, prompt_assets(image_url)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok:false, error:'item_not_found' }, { status: 404 });
    }

    const images: string[] =
      (data as any).prompt_assets?.map((a:any) => a.image_url).filter(Boolean).slice(0,3) ?? [];

    // 準備 multimodal content（OpenAI 兼容格式）
    const sys = '你是中文助理，請用繁體中文，限制在 30 字內，精簡總結此卡片重點。若有圖片，結合畫面說明重點；避免贅詞。';

    const userContent: any[] = [
      { type:'text', text:
          [
            data.title ? `標題：${data.title}` : '',
            data.raw_content ? `內容：${data.raw_content.slice(0,400)}` : '',
            data.url ? `連結：${data.url}` : ''
          ].filter(Boolean).join('\n')
      }
    ];

    for (const url of images) {
      userContent.push({ type:'image_url', image_url: { url } });
    }

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user',   content: userContent },
        ],
        max_tokens: 80,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(()=> '');
      return NextResponse.json({ ok:false, error:`openrouter_failed: ${t}` }, { status: 502 });
    }

    const out = await resp.json();
    let tip =
      out?.choices?.[0]?.message?.content?.trim?.() ||
      out?.choices?.[0]?.text?.trim?.() ||
      '';

    if (tip.length > 60) tip = tip.slice(0, 60); // 粗略切到 ~30中文字

    // 寫回 DB
    const { error: upErr } = await supabase
      .from('items')
      .update({ summary_tip: tip })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok:false, error:`db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok:true, tip });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
