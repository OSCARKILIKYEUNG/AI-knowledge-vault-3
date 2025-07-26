import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openrouterKey = process.env.OPENROUTER_API_KEY!;
const embedModel = process.env.OPENROUTER_EMBED_MODEL || 'mistralai/mistral-embed';

export async function POST(req: Request) {
  try {
    const { query, userId } = await req.json();
    if (!query || !userId) {
      return NextResponse.json({ ok: false, error: 'Missing query or userId' }, { status: 400 });
    }

    const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embedModel,
        input: query,
      }),
    });

    const embeddingJson = await embeddingRes.json();

    if (!embeddingRes.ok || !embeddingJson?.data?.[0]?.embedding) {
      return NextResponse.json({
        ok: false,
        error: 'embedding_failed: ' + JSON.stringify(embeddingJson),
      }, { status: 502 });
    }

    const embedding = embeddingJson.data[0].embedding;

    const { data, error } = await supabase.rpc('match_items', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 10,
      user_id_param: userId,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, results: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
