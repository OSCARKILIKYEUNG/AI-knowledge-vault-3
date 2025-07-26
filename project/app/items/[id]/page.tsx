'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft, Copy, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type Item = Database['public']['Tables']['items']['Row'];
type Asset = { image_url: string | null };

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const itemId = typeof idParam === 'string' ? parseInt(idParam, 10) : NaN;

  const [item, setItem] = useState<Item | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    fetchItem(itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const fetchItem = async (id: number) => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }
      setItem(data);

      const { data: assetData, error: assetError } = await supabase
        .from('prompt_assets')
        .select('image_url')
        .eq('item_id', id);

      if (!assetError) setAssets(assetData || []);
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const copyContent = async () => {
    if (item) {
      await navigator.clipboard.writeText(item.raw_content || '');
      toast.success('內容已複製到剪貼簿');
    }
  };

  const copySummary = async () => {
    if (item?.summary) {
      await navigator.clipboard.writeText(item.summary);
      toast.success('摘要已複製到剪貼簿');
    }
  };

  /** 從 public URL 擷取 storage 的物件 path */
  const getPathFromPublicUrl = (url: string) => {
    // 典型：https://<project>.supabase.co/storage/v1/object/public/prompt-images/<path>
    const marker = '/prompt-images/';
    const i = url.indexOf(marker);
    if (i >= 0) return url.slice(i + marker.length);
    // 後備：切 object/public/
    const alt = '/object/public/';
    const j = url.indexOf(alt);
    return j >= 0 ? url.slice(j + alt.length).replace(/^prompt-images\//, '') : url;
  };

  /** 刪除：先刪 Storage 檔案 → 刪 prompt_assets → 刪 item */
  const handleDelete = async () => {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？此操作會一併刪除相關圖片。');
    if (!ok) return;

    try {
      // 重新讀一次 assets，確保是最新
      const { data: a } = await supabase
        .from('prompt_assets')
        .select('image_url')
        .eq('item_id', item.id);

      const list = (a || assets || []).filter(x => x.image_url).map(x => getPathFromPublicUrl(x.image_url!));

      // 1) 先刪 Storage 檔案（若有）
      if (list.length > 0) {
        const { error: rmErr } = await supabase.storage.from('prompt-images').remove(list);
        if (rmErr) {
          console.error('Storage remove error:', rmErr);
          // 通常是權限或路徑不對，但不阻擋後續 DB 刪除；可視需要在此 return。
        }
      }

      // 2) 刪 prompt_assets（若你已設 ON DELETE CASCADE，可略過這步）
      const { error: delAssetsErr } = await supabase
        .from('prompt_assets')
        .delete()
        .eq('item_id', item.id);
      if (delAssetsErr) {
        // 若用了 CASCADE，這裡可能被 RLS 擋住也沒關係，繼續嘗試刪 items
        console.warn('Delete prompt_assets error (可忽略若有 CASCADE):', delAssetsErr);
      }

      // 3) 刪 item
      const { error: delItemErr } = await supabase.from('items').delete().eq('id', item.id);
      if (delItemErr) {
        console.error(delItemErr);
        toast.error('刪除失敗（items）');
        return;
      }

      toast.success('已刪除');
      router.replace('/dashboard');
    } catch (e) {
      console.error(e);
      toast.error('刪除過程發生錯誤');
    }
  };

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
                {item.type === 'prompt' ? '提示' : '連結'}
              </Badge>
              {item.category && item.category.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.category.map(cat => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>
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
                <p className="bg-blue-50 p-3 rounded text-sm leading-relaxed">
                  {item.summary}
                </p>
              </div>
            )}

            {assets.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">圖片</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {assets
                    .filter(a => a.image_url)
                    .map((a, i) => (
                      <div key={i} className="border rounded p-2 bg-white">
                        <img
                          src={a.image_url as string}
                          alt="prompt asset"
                          className="rounded max-h-64 w-full object-contain"
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
