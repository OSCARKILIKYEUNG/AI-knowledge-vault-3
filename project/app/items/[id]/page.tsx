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
        console.error('[Item] fetch item error:', error);
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }
      setItem(data);

      const { data: assetData, error: assetError } = await supabase
        .from('prompt_assets')
        .select('image_url')
        .eq('item_id', id);
      if (assetError) {
        console.error('[Item] fetch assets error:', assetError);
      }
      setAssets(assetData || []);
    } catch (e) {
      console.error('[Item] unexpected error:', e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const copyContent = async () => {
    if (!item) return;
    await navigator.clipboard.writeText(item.raw_content || '');
    toast.success('內容已複製到剪貼簿');
  };

  const copySummary = async () => {
    if (!item?.summary) return;
    await navigator.clipboard.writeText(item.summary);
    toast.success('摘要已複製到剪貼簿');
  };

  const handleDelete = async () => {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？');
    if (!ok) return;
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      toast.error('刪除失敗');
    } else {
      toast.success('已刪除');
      router.replace('/dashboard');
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
                    .filter((a) => a.image_url)
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
