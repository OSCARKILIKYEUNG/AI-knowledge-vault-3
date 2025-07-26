// /project/app/api/summarize/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge'; // 或 'nodejs' 也可

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY as string;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro';
const SITE_URL = process.env.OPENROUTER_SITE_URL || '';     // 建議: https://你的正式網域
const SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'AI Knowledge Vault';

function json(status: number, data: any) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  // 1) 基本檢查
  if (!OPENROUTER_API_KEY) {
    return json(500, { ok: false, where: 'server', error: 'Missing OPENROUTER_API_KEY' });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title: string = typeof body?.title === 'string' ? body.title : '';
    const description: string = typeof body?.description === 'string' ? body.description : '';
    const images: string[] = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];

    if (!title && !description && images.length === 0) {
      return json(400, { ok: false, where: 'client', error: 'Empty payload (title/description/images all empty)' });
    }

    // 2) 把圖片(最多2張)以 OpenAI 相容格式附上
    const parts: any[] = [
      {
        type: 'text',
        text:
          '請用繁體中文、在「30字內」給一句極簡介，' +
          '不得超過30字、不得換行、不要贅詞。' +
          `\n標題：${title || '（無）'}\n內容/連結：${description || '（無）'}`,
      },
      ...images.slice(0, 2).map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    const payload = {
      model: OPENROUTER_MODEL, // 我們要用 OpenRouter 的 gemini 2.5 pro
      messages: [
        {
          role: 'system',
          content:
            '你是摘要助理。務必以繁體中文單行輸出，不得超過30個中文字，不要多餘標點或換行。',
        },
        { role: 'user', content: parts },
      ],
      temperature: 0.2,
      max_tokens: 80,
    };

    // 3) 呼叫 OpenRouter
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        ...(SITE_URL ? { 'HTTP-Referer': SITE_URL } : {}),
        ...(SITE_NAME ? { 'X-Title': SITE_NAME } : {}),
      },
      body: JSON.stringify(payload),
    }).catch((e) => {
      throw new Error(`fetch_failed: ${e?.message || e}`);
    });

    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // 把 OpenRouter 的錯誤原樣返回，方便你看到原因
      return json(resp.status, {
        ok: false,
        where: 'openrouter',
        httpStatus: resp.status,
        model: OPENROUTER_MODEL,
        imagesTried: images.slice(0, 2),
        error: data?.error?.message || data?.message || 'OpenRouter request failed',
        raw: data,
      });
    }

    const full =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.message?.content ||
      '';

    // 後端再保險切 60 字（前端你仍可顯示 30 字 + hover 看全文）
    const summary = (full || '').slice(0, 60);

    return json(200, { ok: true, summary, model: OPENROUTER_MODEL, usedImages: images.slice(0, 2) });
  } catch (e: any) {
    return json(500, {
      ok: false,
      where: 'server_catch',
      error: e?.message || String(e),
    });
  }
}

// GET 直接回 405（避免你誤以為壞掉）
export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
