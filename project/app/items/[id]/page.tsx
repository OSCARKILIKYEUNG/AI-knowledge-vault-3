'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft, Copy, Trash2, ExternalLink, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';

// 資料型別
type ItemRow = {
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

type AssetRow = {
  id: string;                 // prompt_assets.id
  item_id: number;
  image_url: string | null;   // 可能是外部 URL 或 Storage 公開 URL
  storage_path: string | null; // 若為 Storage 內檔案，會有此路徑；外部圖為 null
};

export const dynamic = 'force-dynamic';

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const itemId = typeof idParam === 'string' ? Number(idParam) : NaN;

  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    reloadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  async function reloadItem() {
    try {
      setLoading(true);

      // 讀 Item
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('id, user_id, type, title, raw_content, url, summary, summary_tip, category, created_at')
        .eq('id', itemId)
        .single();

      if (itemError || !itemData) {
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }
      setItem(itemData as ItemRow);

      // 讀圖片
      const { data: assetData, error: assetErr } = await supabase
        .from('prompt_assets')
        .select('id, item_id, image_url, storage_path')
        .eq('item_id', itemId);

      if (!assetErr) {
        setAssets((assetData ?? []) as AssetRow[]);
      }
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  // 重算 30 字內摘要（多模態）
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
      if (json.message) toast.message(json.message); // 僅圖片時的友善提示
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    } finally {
      setRecomputing(false);
    }
  }

  // 複製
  async function copyContent() {
    try {
      await navigator.clipboard.writeText(item?.raw_content || '');
      toast.success('內容已複製到剪貼簿');
    } catch {
      toast.error('複製失敗');
    }
  }
  async function copySummary() {
    try {
      if (!item?.summary) return toast.message('沒有摘要可複製');
      await navigator.clipboard.writeText(item.summary);
      toast.success('摘要已複製到剪貼簿');
    } catch {
      toast.error('複製失敗');
    }
  }

  // 刪除整個項目
  async function deleteItem() {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？（圖片資料會一併刪除）');
    if (!ok) return;

    // 先嘗試刪除 Storage 內圖片（外部圖略過）
    try {
      const internalPaths = assets
        .map(a => a.storage_path)
        .filter((p): p is string => !!p);
      if (internalPaths.length) {
        const { error: stErr } = await supabase.storage.from('prompt-images').remove(internalPaths);
        if (stErr) console.warn('刪除 Storage 失敗：', stErr.message);
      }
    } catch (e) {
      console.warn('刪除 Storage 例外：', e);
    }

    // 刪除 prompt_assets 資料列
    await supabase.from('prompt_assets').delete().eq('item_id', item.id);

    // 刪除 item
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      toast.error('刪除失敗');
    } else {
      toast.success('已刪除');
      router.replace('/dashboard');
    }
  }

  // 刪除單張圖片
  async function deleteAsset(asset: AssetRow) {
    const ok = confirm('確定刪除此圖片？');
    if (!ok) return;
    try {
      // 若是 Storage 內檔案，先刪 Storage
      if (asset.storage_path) {
        const { error: stErr } = await supabase.storage.from('prompt-images').remove([asset.storage_path]);
        if (stErr) console.warn('刪除 Storage 失敗：', stErr.message);
      }
      // 刪資料列
      const { error: dbErr } = await supabase.from('prompt_assets').delete().eq('id', asset.id);
      if (dbErr) throw dbErr;
      toast.success('圖片已刪除');
      await reloadItem();
    } catch (e: any) {
      console.error(e);
      toast.error('刪除圖片失敗');
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
        {/* 頂部工具列 */}
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
            <Button variant="outline" onClick={copyContent} title="複製原始內容">
              <Copy className="h-4 w-4 mr-2" />
              複製內容
            </Button>
            <Button variant="outline" onClick={copySummary} title="複製長摘要">
              <Copy className="h-4 w-4 mr-2" />
              複製摘要
            </Button>
            <Button variant="default" onClick={recomputeTip} disabled={recomputing} title="重新產生 30 字摘要（會納入最新圖片）">
              <RefreshCw className="h-4 w-4 mr-2" />
              {recomputing ? '重算中…' : '重算提示'}
            </Button>
            <Button variant="destructive" onClick={deleteItem}>
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

            {/* ✅ 完整顯示 30 字內提示（不截斷） */}
            {(item.summary_tip ?? '').trim() && (
              <p className="mt-2 text-sm text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded whitespace-pre-wrap break-words">
                提示：{item.summary_tip}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 原始連結（若為 link 類） */}
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
            <div>
              <h3 className="font-medium mb-2">內容</h3>
              <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm break-words">
                {item.raw_content || '（無內容）'}
              </pre>
            </div>

            {/* 長摘要（若有） */}
            {(item.summary ?? '').trim() && (
              <div>
                <h3 className="font-medium mb-2">AI 摘要</h3>
                <p className="bg-blue-50 p-3 rounded text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {item.summary}
                </p>
              </div>
            )}

            {/* 圖片區（完整顯示） */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="h-4 w-4 text-gray-600" />
                <h3 className="font-medium">圖片</h3>
              </div>

              {assets.length === 0 ? (
                <p className="text-sm text-gray-500">（沒有圖片）</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((a) => (
                    <div key={a.id} className="border rounded p-2 bg-white">
                      {a.image_url ? (
                        <img
                          src={a.image_url}
                          alt="項目圖片"
                          className="rounded w-full object-contain max-h-64"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-40 flex items-center justify-center text-sm text-gray-400">
                          無可用圖片
                        </div>
                      )}

                      <div className="mt-2 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => deleteAsset(a)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          刪圖
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
