// Client-side API functions for Netlify Functions

export async function generateSummary(text: string): Promise<string> {
  try {
    const response = await fetch('/.netlify/functions/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.summary || '無法生成摘要';
  } catch (error) {
    console.error('Error generating summary:', error);
    return '無法生成摘要';
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('/.netlify/functions/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding || [];
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

export async function searchItems(query: string, userId: string): Promise<any[]> {
  try {
    // First get embedding for the query
    const embedding = await generateEmbedding(query);

    const response = await fetch('/.netlify/functions/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, embedding, userId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching items:', error);
    return [];
  }
}