'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ItemRow = Database['public']['Tables']['items']['Row'];
type Asset = { id: string; image_url: string | null; storage_path?: string | null };

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idNum = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [recomputing, setRecomputing] = useState(false);

  /* ---------- 讀資料 ---------- */
  async function loadItem() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', idNum)
        .single();

      if (error || !data) {
        toast.error('找不到該項目');
        router.replace('/dashboard');
        return;
      }
      setItem(data);

      const { data: imgs } = await supabase
        .from('prompt_assets')
        .select('id,image_url,storage_path')
        .eq('item_id', idNum);

      setAssets(imgs ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isNaN(idNum)) {
      toast.error('無效的 ID');
      router.replace('/dashboard');
      return;
    }
    loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNum]);

  /* ---------- 重新計算 30 字提示 ---------- */
  async function recomputeTip() {
    try {
      setRecomputing(true);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: idNum }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '重算失敗');

      if (json.message) toast.message(json.message); // 後端友善提醒
      toast.success('AI 摘要已更新');
      await loadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    } finally {
      setRecomputing(false);
    }
  }

  /* ---------- 複製 ---------- */
  function copy(text?: string | null, msg = '已複製') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success(msg));
  }

  /* ---------- 刪除 ---------- */
  async function handleDelete() {
    if (!item) return;
    if (!confirm('確定要刪除此項目？')) return;

    try {
      // 1) 刪 Storage 圖（有 storage_path 才能刪）
      const paths = assets.map((a) => a.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from('prompt-images').remove(paths);
      }
      // 2) 刪 prompt_assets
      await supabase.from('prompt_assets').delete().eq('item_id', item.id);
      // 3) 刪 items
      await supabase.from('items').delete().eq('id', item.id);

      toast.success('已刪除');
      router.replace('/dashboard');
    } catch (e) {
      toast.error('刪除失敗');
    }
  }

  /* ---------- UI ---------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        載入中…
      </div>
    );
  }
  if (!item) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* 上方操作列 */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回
          </Link>
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => copy(item.raw_content, '內容已複製')}>
            <Copy className="h-4 w-4 mr-1" /> 複製內容
          </Button>
          {item.summary && (
            <Button variant="outline" onClick={() => copy(item.summary, '摘要已複製')}>
              <Copy className="h-4 w-4 mr-1" /> 複製摘要
            </Button>
          )}
          <Button variant="outline" onClick={recomputeTip} disabled={recomputing}>
            <RefreshCcw className="h-4 w-4 mr-1" />
            {recomputing ? '重算中…' : '重算提示'}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> 刪除
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          {/* 類型 & 分類 */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
              {item.type === 'prompt' ? 'Prompt' : '連結'}
            </Badge>
            {item.category?.map((c) => (
              <Badge key={c} variant="outline" className="text-xs">
                {c}
              </Badge>
            ))}
          </div>

          {/* 標題 / 日期 */}
          <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
          <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>

          {/* 30 字提示（完整顯示，保留換行） */}
          {item.summary_tip && (
            <p className="mt-3 text-blue-700 whitespace-pre-wrap break-words">
              提示：{item.summary_tip}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Link 項目的原始連結 */}
          {item.url && (
            <div>
              <h3 className="font-medium mb-2">原始連結</h3>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 inline-flex items-center gap-1 hover:underline break-all"
              >
                {item.url}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}

          {/* 內容 */}
          {item.raw_content && (
            <div>
              <h3 className="font-medium mb-2">內容</h3>
              <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm">
                {item.raw_content}
              </pre>
            </div>
          )}

          {/* 長摘要（若有） */}
          {item.summary && (
            <div>
              <h3 className="font-medium mb-2">AI 長摘要</h3>
              <p className="bg-blue-50 p-3 rounded text-sm whitespace-pre-wrap leading-relaxed">
                {item.summary}
              </p>
            </div>
          )}

          {/* 圖片群組 */}
          {assets.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">圖片</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {assets.map((a) => (
                  a.image_url && (
                    <a key={a.id} href={a.image_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={a.image_url}
                        alt="asset"
                        className="w-full max-h-64 object-contain bg-white rounded border"
                        loading="lazy"
                      />
                    </a>
                  )
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
