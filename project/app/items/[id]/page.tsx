'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft, Copy, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type Item = {
  id: number;
  user_id: string;
  type: 'prompt' | 'link';
  title: string | null;
  raw_content: string | null;
  url: string | null;
  summary: string | null;
  summary_tip?: string | null;
  category: string[] | null;
  created_at: string;
};

type Asset = { id: string; image_url: string | null; storage_path?: string | null };

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const itemId = typeof idParam === 'string' ? parseInt(idParam, 10) : NaN;

  const [item, setItem] = useState<Item | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.push('/dashboard');
      return;
    }
    reloadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function reloadItem() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (error || !data) {
        toast.error('找不到項目');
        router.push('/dashboard');
        return;
      }
      setItem(data as Item);

      const { data: assetData } = await supabase
        .from('prompt_assets')
        .select('id,image_url,storage_path')
        .eq('item_id', itemId);

      setAssets(assetData || []);
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function copyContent() {
    if (item) {
      await navigator.clipboard.writeText(item.raw_content || '');
      toast.success('內容已複製到剪貼簿');
    }
  }

  async function copySummary() {
    if (item?.summary) {
      await navigator.clipboard.writeText(item.summary);
      toast.success('摘要已複製到剪貼簿');
    }
  }

  async function handleDelete() {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？');
    if (!ok) return;
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      toast.error('刪除失敗');
    } else {
      toast.success('已刪除');
      router.push('/dashboard');
    }
  }

  // 重新計算 AI 30 字提示（會納入最新圖片/文字）
  async function recomputeTip() {
    try {
      setRecomputing(true);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '重算失敗');
      toast.success('AI 摘要已更新');
      if (json.message) toast.message(json.message);
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    } finally {
      setRecomputing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">項目詳情</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyContent}>
              <Copy className="h-4 w-4 mr-2" />
              複製內容
            </Button>
            {item.summary && (
              <Button variant="outline" onClick={copySummary}>
                <Copy className="h-4 w-4 mr-2" />
                複製摘要
              </Button>
            )}
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              刪除
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                {item.type === 'prompt' ? 'Prompt' : '連結'}
              </Badge>

              {item.category && item.category.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.category.map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>

            <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>

            {/* 👉 詳情頁：完整顯示 summary_tip，不截斷 */}
            {(item.summary_tip ?? '').trim() && (
              <div className="mt-3">
                <div className="inline-flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded">
                  <span className="font-medium">AI 提示</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    title="重算提示（含最新圖片/文字）"
                    onClick={recomputeTip}
                    disabled={recomputing}
                  >
                    <RefreshCw className={`h-4 w-4 ${recomputing ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap break-words">
                  {item.summary_tip}
                </p>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
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

            <div>
              <h3 className="font-medium mb-2">內容</h3>
              <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm">
                {item.raw_content || '（無內容）'}
              </pre>
            </div>

            {item.summary && (
              <div>
                <h3 className="font-medium mb-2">AI 摘要</h3>
                <p className="bg-blue-50 p-3 rounded text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {item.summary}
                </p>
              </div>
            )}

            {assets.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">圖片</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {assets
                    .filter((a) => a.image_url)
                    .map((a) => (
                      <div key={a.id} className="border rounded p-2 bg-white">
                        <img
                          src={a.image_url as string}
                          alt="prompt asset"
                          className="rounded max-h-64 w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
