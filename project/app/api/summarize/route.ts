// /project/app/api/summarize/route.ts
import { NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// 如果你用 OpenAI，改成：
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title = '', description = '', images = [] as string[] } = body || {};

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Missing OPENROUTER_API_KEY' },
        { status: 500 }
      );
    }

    // 構造 multi‑modal content：先文字，再最多 2 張圖片
    const contents: any[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `請根據以下資訊，輸出繁體中文 30 字以內的精簡介紹（不要超過30字、不要加標點尾語、不要使用換行）。\n\n` +
              `標題：${title}\n` +
              `內容/連結：${description || '（無）'}\n` +
              (images?.length ? `圖片共 ${images.length} 張（已附前兩張 URL）` : '沒有圖片')
          },
          // 將圖片以 image_url 的方式附上（最多 2 張）
          ...images
            .filter(Boolean)
            .slice(0, 2)
            .map((url: string) => ({
              type: 'image_url',
              image_url: { url },
            })),
        ],
      },
    ];

    // 呼叫 OpenRouter（OpenAI 兼容格式）
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: contents,
        temperature: 0.2,
        max_tokens: 80,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: txt }, { status: resp.status });
    }

    const data = await resp.json();
    const text: string =
      data?.choices?.[0]?.message?.content?.trim?.() || '';

    // 保障 <= 30 字
    const summary = text.slice(0, 30);
    return NextResponse.json({ summary });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
