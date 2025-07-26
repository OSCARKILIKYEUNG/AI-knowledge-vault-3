// lib/api.ts
// 前端呼叫 Next.js /api 路由（不再用 Netlify Functions）

/** Hybrid 搜尋（關鍵字 + 向量）。mode 可選：'hybrid' | 'keyword' | 'semantic' */
export async function searchItems(
  q: string,
  userId: string,
  mode: 'hybrid' | 'keyword' | 'semantic' = 'hybrid',
  limit = 24
): Promise<any[]> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, userId, mode, limit }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `search_failed (${res.status})`);
  }
  return json.items as any[];
}

/** 針對單一 item 產生 30 字內摘要提示（含圖片、內容）並寫回 items.summary_tip */
export async function requestItemTip(itemId: number): Promise<string> {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `summarize_failed (${res.status})`);
  }
  // 回傳本次產生的 tip（同時已寫回 DB）
  return json.tip as string;
}

/** 重新計算指定 item 的 embedding（向量），寫入 items.embedding */
export async function reindexItem(itemId: number): Promise<void> {
  const res = await fetch('/api/process-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `process_item_failed (${res.status})`);
  }
}
