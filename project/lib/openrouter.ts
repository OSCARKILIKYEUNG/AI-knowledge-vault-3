export async function summarize(text: string): Promise<string> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Knowledge Vault',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet', // You can change this to any model you prefer
        messages: [
          {
            role: 'user',
            content: `請用繁體中文輸出一句摘要：${text}`
          }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '無法生成摘要';
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error('Failed to generate summary');
  }
}

export async function embed(text: string): Promise<number[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI Knowledge Vault',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small', // OpenAI's embedding model via OpenRouter
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0]?.embedding || [];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}