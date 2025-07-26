// app/api/embed/route.ts
import { NextResponse } from 'next/server';

const openrouterKey = process.env.OPENROUTER_API_KEY!;
const EMBED_MODEL = 'cohere/embed-multilingual-v3.0';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? '').toString();

    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: 'missing text' }, { status: 400 });
    }

    const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `embedding_failed: ${t}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const embedding: number[] = data?.data?.[0]?.embedding ?? [];
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ ok: false, error: 'empty_embedding' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, embedding, dim: embedding.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
