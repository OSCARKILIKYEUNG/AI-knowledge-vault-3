'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, ArrowLeft, Copy, Trash2, Edit3, Save, X, Upload } from 'lucide-react';
import { toast } from 'sonner';

type Item = Database['public']['Tables']['items']['Row'];
type Asset = { id?: number; image_url: string | null };

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idStr = (params?.id as string) ?? '';
  const itemId = Number(idStr);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<Item | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [edit, setEdit] = useState(false);

  // 編輯用狀態
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [moreFiles, setMoreFiles] = useState<FileList | null>(null);

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 一次帶出 assets
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .eq('id', itemId)
        .single();

      if (error || !data) {
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }

      setItem(data as Item);
      setAssets(((data as any).prompt_assets ?? []) as Asset[]);

      // 填入編輯欄位
      setTitle(data.title ?? '');
      setRawContent(data.raw_content ?? '');
      setCategoryInput((data.category ?? []).join(', '));
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(
    () => (item?.category ?? [] as string[]),
    [item]
  );

  const copyContent = async () => {
    await navigator.clipboard.writeText(item?.raw_content ?? '');
    toast.success('內容已複製到剪貼簿');
  };

  const copySummary = async () => {
    const s = item?.summary ?? '';
    if (!s) return;
    await navigator.clipboard.writeText(s);
    toast.success('摘要已複製到剪貼簿');
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm('確定要刪除此項目？')) return;

    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      console.error(error);
      toast.error('刪除失敗');
    } else {
      toast.success('已刪除');
      router.replace('/dashboard');
    }
  };

  const saveEdit = async () => {
    if (!item) return;
    try {
      const cats = categoryInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('items')
        .update({
          title: title || null,
          raw_content: rawContent || null,
          category: cats.length ? cats : null,
        })
        .eq('id', item.id);

      if (error) throw error;

      // 追加上傳圖片
      if (moreFiles && moreFiles.length > 0) {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          for (const file of Array.from(moreFiles)) {
            if (!file.type.startsWith('image/')) {
              toast.error(`僅支援圖片：${file.name}`);
              continue;
            }
            const path = `${uid}/${item.id}-${Date.now()}-${file.name}`;
            const { error: upErr } = await supabase
              .storage
              .from('prompt-images')
              .upload(path, file, { cacheControl: '3600', upsert: false });
            if (upErr) {
              console.error(upErr);
              toast.error(`圖片上傳失敗：${file.name}`);
              continue;
            }
            const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
            const publicUrl = pub?.publicUrl ?? null;
            if (publicUrl) {
              const { error: assetErr } = await supabase
                .from('prompt_assets')
                .insert({ item_id: item.id, image_url: publicUrl });
              if (assetErr) console.error(assetErr);
            }
          }
        }
      }

      toast.success('已儲存');
      setEdit(false);
      setMoreFiles(null);
      await fetchData();
    } catch (e) {
      console.error(e);
      toast.error('儲存失敗');
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
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>

          <div className="flex gap-2">
            {!edit ? (
              <Button variant="outline" onClick={() => setEdit(true)} className="gap-2">
                <Edit3 className="h-4 w-4" />
                編輯
              </Button>
            ) : (
              <>
                <Button onClick={saveEdit} className="gap-2">
                  <Save className="h-4 w-4" />
                  儲存
                </Button>
                <Button variant="outline" onClick={() => setEdit(false)} className="gap-2">
                  <X className="h-4 w-4" />
                  取消
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={handleDelete} className="gap-2">
              <Trash2 className="h-4 w-4" />
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
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {categories.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              )}
            </div>
            <CardTitle className="text-xl">
              {item.title ?? '（無標題）'}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              建立於：{new Date(item.created_at).toLocaleString()}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {!edit ? (
              <>
                {item.url && (
                  <div className="text-sm">
                    <span className="font-medium mr-2">原始連結：</span>
                    <a className="text-blue-600 break-all underline" href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">內容</h3>
                    <Button size="sm" variant="outline" onClick={async () => {
                      await navigator.clipboard.writeText(item.raw_content ?? '');
                      toast.success('內容已複製');
                    }} className="gap-2">
                      <Copy className="h-4 w-4" />
                      複製
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm">
                    {item.raw_content || '（無內容）'}
                  </pre>
                </div>

                {item.summary && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">AI 摘要</h3>
                      <Button size="sm" variant="outline" onClick={copySummary} className="gap-2">
                        <Copy className="h-4 w-4" />
                        複製摘要
                      </Button>
                    </div>
                    <p className="bg-blue-50 p-3 rounded text-sm leading-relaxed">{item.summary}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm">標題</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm">內容</label>
                  <Textarea rows={6} value={rawContent} onChange={(e) => setRawContent(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm">分類（逗號分隔）</label>
                  <Input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="例如：設計, 產品, 策略"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm flex items-center gap-2">
                    <Upload className="h-4 w-4" /> 追加上傳圖片（可多選）
                  </label>
                  <Input type="file" accept="image/*" multiple onChange={(e) => setMoreFiles(e.target.files)} />
                </div>
              </>
            )}

            {/* 圖片牆 */}
            {assets.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">圖片</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {assets
                    .filter((a) => a.image_url)
                    .map((a, i) => (
                      <div key={`${i}-${a.image_url}`} className="border rounded p-2 bg-white">
                        <img
                          src={a.image_url as string}
                          alt="asset"
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
