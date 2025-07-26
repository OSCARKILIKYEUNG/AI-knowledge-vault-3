// app/api/summarize/route.ts
import { NextResponse } from 'next/server';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function POST(req: Request) {
  try {
    const { title, raw_content, url, image_url } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'MISSING_KEY', message: 'OPENROUTER_API_KEY 未設定' },
        { status: 500 }
      );
    }

    const chunks: string[] = [];
    if (title) chunks.push(`標題: ${title}`);
    if (raw_content) chunks.push(`內容: ${raw_content}`);
    if (url) chunks.push(`連結: ${url}`);
    if (image_url) chunks.push(`圖片: ${image_url}`);
    const userContent = chunks.join('\n').slice(0, 4000);

    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是一位中文（繁體）簡報助理。請用最多30字，輸出一行精煉描述；避免列表、emoji、贅詞與過多標點。'
        },
        {
          role: 'user',
          content: `請以≤30字概述這則資料重點：\n${userContent}`
        }
      ],
      temperature: 0.2,
      max_tokens: 60
    };

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Knowledge Vault'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('OpenRouter error:', data);
      return NextResponse.json(
        { error: 'LLM_ERROR', detail: data },
        { status: 500 }
      );
    }

    let text: string = data?.choices?.[0]?.message?.content?.trim() || '';
    const summary = text.slice(0, 30); // 最多 30 個字元

    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: 'SERVER_ERROR', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
