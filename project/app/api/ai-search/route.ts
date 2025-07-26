// app/api/ai-search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 斷詞：空白/逗號/中文標點
function tokenize(q: string): string[] {
  return q
    .split(/[,\s，。；;、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawQuery = (body?.query ?? '').toString().trim();
    const userId = (body?.userId ?? '').toString().trim();

    if (!userId) return NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 });
    if (!rawQuery) return NextResponse.json({ ok: false, error: 'missing query' }, { status: 400 });

    const tokens = tokenize(rawQuery.toLowerCase());
    if (tokens.length === 0) return NextResponse.json({ ok: true, ids: [] });

    // 限 200 筆，避免一次抓太多
    const { data, error } = await supabaseAdmin
      .from('items')
      .select('id, summary_tip')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    type Row = { id: number; summary_tip: string | null };
    const scored = (data as Row[]).map((row) => {
      const tip = (row.summary_tip ?? '').toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (t && tip.includes(t)) score += 1;
      }
      if (tokens.length > 1 && tip.includes(rawQuery.toLowerCase())) score += 1;
      return { id: row.id, score };
    });

    const ids = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.id);

    return NextResponse.json({ ok: true, ids });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown_error' }, { status: 500 });
  }
}
