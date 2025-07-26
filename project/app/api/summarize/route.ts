// /project/app/api/summarize/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge'; // 也可用 'nodejs'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY as string;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-pro';
const SITE_URL = process.env.OPENROUTER_SITE_URL || '';
const SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'AI Knowledge Vault';

export async function POST(req: Request) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Missing OPENROUTER_API_KEY' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const title: string = body?.title ?? '';
    const description: string = body?.description ?? '';
    const images: string[] = Array.isArray(body?.images) ? body.images : [];

    // 把圖片（最多 2 張）以 OpenAI 相容的 image_url 格式附上
    const parts: any[] = [
      {
        type: 'text',
        text:
          '請用繁體中文、在「30字內」給一句極簡介，' +
          '不要超過30字、不要換行、不要贅詞。' +
          `\n標題：${title}\n內容/連結：${description || '（無）'}`,
      },
      ...(images || [])
        .slice(0, 2)
        .map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    const payload = {
      model: OPENROUTER_MODEL, // google/gemini-2.5-pro
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

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        // OpenRouter 建議帶站點資料
        ...(SITE_URL ? { 'HTTP-Referer': SITE_URL } : {}),
        ...(SITE_NAME ? { 'X-Title': SITE_NAME } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'OpenRouter request failed' },
        { status: resp.status }
      );
    }

    const full =
      data?.choices?.[0]?.message?.content?.trim?.() ||
      data?.choices?.[0]?.message?.content ||
      '';

    // 後端再保一層：最多擷取 60 字（UI 仍限制顯示 30 字，hover 看全文）
    const summary = full.slice(0, 60);
    return NextResponse.json({ summary });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
