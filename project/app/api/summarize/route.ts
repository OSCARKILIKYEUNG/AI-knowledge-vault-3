// /project/app/api/summarize/route.ts
import { NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

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

    // 將圖片 URL 一併寫入文字，避免模型忽略 image parts
    const imgsText = images?.length
      ? `\n圖片連結（最多顯示兩張）：\n${images.slice(0, 2).join('\n')}\n`
      : '\n沒有圖片\n';

    const userText =
      `請依以下資料，用繁體中文輸出**30字以內**的極精簡介紹（不要超過30字、不要贅詞、不要換行）：\n` +
      `標題：${title}\n` +
      `內容/連結：${description || '（無）'}\n` +
      imgsText;

    const messageParts: any[] = [{ type: 'text', text: userText }];

    // 同時提供 image_url（最多 2 張）
    images
      ?.filter(Boolean)
      .slice(0, 2)
      .forEach((url) => {
        messageParts.push({ type: 'image_url', image_url: { url } });
      });

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: messageParts }],
        temperature: 0.2,
        max_tokens: 80,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: txt }, { status: resp.status });
    }

    const data = await resp.json();
    const full = (data?.choices?.[0]?.message?.content || '').trim();

    // 仍然強制保底 <= 60（UI 會再截 30，但 hover 顯示 full）
    const safeFull = full.slice(0, 60);
    return NextResponse.json({ summary: safeFull });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
