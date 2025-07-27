// app/api/link-preview/route.ts
import { NextResponse } from 'next/server';

const LINK_PREVIEW_API_KEY = process.env.LINK_PREVIEW_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!LINK_PREVIEW_API_KEY) {
      return NextResponse.json({ ok: false, error: 'missing LINK_PREVIEW_API_KEY' }, { status: 500 });
    }

    const { url } = await req.json().catch(() => ({}));
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ ok: false, error: 'missing url' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ ok: false, error: 'invalid url' }, { status: 400 });
    }

    const api = `https://api.linkpreview.net/?key=${encodeURIComponent(
      LINK_PREVIEW_API_KEY
    )}&q=${encodeURIComponent(url)}`;

    const resp = await fetch(api, { method: 'GET' });
    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: data?.description || data?.error || 'linkpreview_failed' },
        { status: resp.status }
      );
    }

    // LinkPreview.net 回傳格式通常是：{ title, description, image, url }
    const normalized = {
      title: (data?.title ?? '').toString(),
      description: (data?.description ?? '').toString(),
      image: (data?.image ?? '').toString(),
      url: (data?.url ?? url).toString(),
    };

    return NextResponse.json({ ok: true, preview: normalized });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
