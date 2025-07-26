// app/api/process-item/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleKey   = process.env.GOOGLE_API_KEY!;

const admin = createClient(supabaseUrl, serviceKey);
export const dynamic = 'force-dynamic';

async function getGeminiEmbedding(input: string): Promise<number[]> {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=' +
    encodeURIComponent(googleKey);

  const body = {
    model: 'models/text-embedding-004',
    content: { parts: [{ text: input }] },
    // outputDimensionality: 768, // 可省略，使用預設
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`gemini_failed: ${t}`);
  }

  const data = await resp.json();
  const values: number[] = data?.embedding?.value || data?.embedding?.values || [];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('gemini_empty_embedding');
  }
  return values;
}

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    const id = Number(itemId);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: 'missing itemId' }, { status: 400 });
    }

    const { data: item, error } = await admin
      .from('items')
      .select('id, title, raw_content, url, category')
      .eq('id', id)
      .single();

    if (error || !item) {
      return NextResponse.json({ ok: false, error: 'item_not_found' }, { status: 404 });
    }

    const embedText = [
      item.title || '',
      item.raw_content || '',
      item.url || '',
      (item.category || []).join(' ')
    ].filter(Boolean).join('\n');

    if (!embedText.trim()) {
      await admin.from('items').update({ embedding: null }).eq('id', id);
      return NextResponse.json({ ok: true, message: 'empty_content' });
    }

    const embedding = await getGeminiEmbedding(embedText);

    const { error: upErr } = await admin
      .from('items')
      .update({ embedding })
      .eq('id', id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, dim: embedding.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
