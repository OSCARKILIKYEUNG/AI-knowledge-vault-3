// project/app/api/summarize/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'edge'; // 輕量、快；也可刪掉用 node

type SummarizeBody = {
  title?: string | null;
  raw_content?: string | null;
  url?: string | null;
  images?: string[]; // 之後若要傳圖片網址可用
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SummarizeBody;

    const title = (body.title ?? '').slice(0, 200);
    const content = (body.raw_content ?? '').slice(0, 2000);
    const link = (body.url ?? '').slice(0, 300);

    const pieces = [
      title && `標題：${title}`,
      content && `內容：${content}`,
      link && `連結：${link}`,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `
你是中文產品小編。請以繁體中文，幫我用不超過30字的單句，
精準概述這個項目重點（可包含圖片/連結大意）。避免贅詞、標點過多。
---
${pieces}
    `.trim();

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENROUTER_API_KEY' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // 可選：標註來源網站，有助模型優先度
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || '',
        'X-Title': 'AI Knowledge Vault',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是精準中文摘要助手。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 80,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: 'LLM request failed', detail: text }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }

    const data = await resp.json();
    const summary =
      data?.choices?.[0]?.message?.content?.trim() ||
      '（暫無摘要）';

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
