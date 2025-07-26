// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 伺服器端 admin client（可繞過 RLS）
const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

export async function POST(req: Request) {
  try {
    const { query, userId } = await req.json();

    if (!query || !userId) {
      return NextResponse.json({ ok: false, error: 'missing query or userId' }, { status: 400 });
    }

    // 1) 用 RPC 取最相關 items
    const { data: items, error } = await sbAdmin.rpc('search_by_tip', {
      q: query,
      uid: userId
    });

    if (error) {
      return NextResponse.json({ ok: false, error: `rpc_failed: ${error.message}` }, { status: 500 });
    }

    const list = Array.isArray(items) ? items : [];

    // 2) 再把每個 item 的首圖補上（給 dashboard 顯示）
    const ids = list.map((it: any) => it.id);
    let assetsByItem: Record<number, string[]> = {};

    if (ids.length > 0) {
      const { data: pa } = await sbAdmin
        .from('prompt_assets')
        .select('item_id, image_url')
        .in('item_id', ids);

      (pa || []).forEach((row) => {
        const iid = (row as any).item_id as number;
        const url = (row as any).image_url as string | null;
        if (!assetsByItem[iid]) assetsByItem[iid] = [];
        if (url) assetsByItem[iid].push(url);
      });
    }

    // 3) 合併回傳（保持你前端資料形狀）
    const merged = list.map((it: any) => ({
      ...it,
      prompt_assets: (assetsByItem[it.id] || []).map((u) => ({ image_url: u })),
    }));

    return NextResponse.json({ ok: true, results: merged });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
