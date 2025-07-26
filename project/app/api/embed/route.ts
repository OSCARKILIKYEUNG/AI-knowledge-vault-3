// app/api/embed/route.ts
import { NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'missing text' }, { status: 400 });
    }

    // 用 OpenRouter 的 Embeddings 端點 + Cohere 多語模型
    const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'cohere/embed-multilingual-v3.0',
        input: text,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'openrouter_embed_failed' },
        { status: resp.status }
      );
    }

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return NextResponse.json({ error: 'no embedding returned' }, { status: 502 });
    }

    return NextResponse.json({ embedding });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
