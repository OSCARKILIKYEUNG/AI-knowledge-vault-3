// lib/api.ts
export async function generateEmbedding(text: string): Promise<number[]> {
  const resp = await fetch('/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error(j?.error || 'embed_failed');
  return j.embedding || [];
}

export async function searchItems(query: string, userId: string): Promise<any[]> {
  const resp = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, userId }),
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error(j?.error || 'search_failed');
  return j.results || [];
}
