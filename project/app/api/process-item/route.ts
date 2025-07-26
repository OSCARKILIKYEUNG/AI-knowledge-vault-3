// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openrouterKey = process.env.OPENROUTER_API_KEY!;

const EMBED_MODEL = 'cohere/embed-multilingual-v3.0';
const CHAT_MODEL  = 'openai/gpt-4o-mini';

const supabaseAdmin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawId = body?.itemId;
    const itemId = Number(rawId);
    if (!itemId || Number.isNaN(itemId)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    // 取 item + 圖片
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('items')
      .select('id, title, raw_content, url, category, summary, prompt_assets(image_url)')
      .eq('id', itemId)
      .single();
    if (itemErr || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    const images: string[] =
      (item as any).prompt_assets?.map((a: any) => a.image_url).filter(Boolean) ?? [];

    // === 1) 產生一般摘要 ===
    const sysPrompt =
      '你是中文寫作助理，請輸出「精簡中文摘要」。請條理清晰、短段落、重點化，避免冗語。';
    const userPrompt = [
      item.title ? `標題：${item.title}` : '',
      item.raw_content ? `內容（節錄）：${String(item.raw_content).slice(0, 1200)}` : '',
      item.url ? `連結：${item.url}` : '',
      images.length ? `圖片數：${images.length}` : '',
    ].filter(Boolean).join('\n');

    const chatResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!chatResp.ok) {
      const t = await chatResp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `openrouter_chat_failed: ${t}` }, { status: 502 });
    }
    const chatJson = await chatResp.json();
    const summary: string =
      chatJson?.choices?.[0]?.message?.content?.trim?.() ||
      chatJson?.choices?.[0]?.text?.trim?.() ||
      '';

    // === 2) 產生 Embedding（Cohere 多語） ===
    const embedInput = [
      item.title ?? '',
      summary ?? '',
      (item.raw_content as string | null)?.slice(0, 2000) ?? '',
      item.url ?? '',
      images.length ? `圖片數：${images.length}` : '',
    ].join('\n\n');

    const embResp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: embedInput,
      }),
    });

    if (!embResp.ok) {
      const t = await embResp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `embedding_failed: ${t}` }, { status: 502 });
    }
    const embJson = await embResp.json();
    const embedding: number[] = embJson?.data?.[0]?.embedding ?? [];
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_embedding' }, { status: 500 });
    }

    // === 3) 回寫 DB ===
    const { error: upErr } = await supabaseAdmin
      .from('items')
      .update({ summary, embedding })
      .eq('id', itemId);
    if (upErr) {
      return NextResponse.json({ ok: false, error: `db_update_failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, summary, embedding_dim: embedding.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
