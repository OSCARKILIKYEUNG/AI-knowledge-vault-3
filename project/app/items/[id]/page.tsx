'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import {
  Brain, ArrowLeft, Copy, Trash2, ExternalLink, Pencil, Save, X, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';

type ItemRow = Database['public']['Tables']['items']['Row'] & {
  summary_tip?: string | null;
};
type AssetRow = {
  id: string;
  item_id: number;
  image_url: string | null;
  storage_path: string | null;
};

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const itemId = typeof idParam === 'string' ? Number(idParam) : NaN;

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  // 編輯狀態
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<'prompt' | 'link'>('prompt');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  // Link 預覽
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 重算提示
  const [recomputingTip, setRecomputingTip] = useState(false);

  const safeName = (name: string) =>
    name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.push('/dashboard');
      return;
    }
    fetchItem(itemId);
  }, [itemId, router]);

  async function fetchItem(id: number) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('items')
        .select('id,user_id,type,title,raw_content,url,summary,summary_tip,category,created_at')
        .eq('id', id)
        .single();
      if (error || !data) {
        toast.error('找不到項目');
        router.push('/dashboard');
        return;
      }
      setItem(data as ItemRow);

      // 填入編輯表單
      setType((data.type as 'prompt' | 'link') ?? 'prompt');
      setTitle(data.title ?? '');
      setUrl(data.url ?? '');
      setRawContent(data.raw_content ?? '');
      setCategoryInput((data.category ?? []).join(', '));

      // 讀取圖片資產
      const { data: assetData } = await supabase
        .from('prompt_assets')
        .select('id,item_id,image_url,storage_path')
        .eq('item_id', id);
      setAssets((assetData ?? []) as AssetRow[]);
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function copyContent() {
    if (!item) return;
    await navigator.clipboard.writeText(item.raw_content || '');
    toast.success('內容已複製到剪貼簿');
  }
  async function copySummary() {
    if (!item?.summary) return;
    await navigator.clipboard.writeText(item.summary);
    toast.success('摘要已複製到剪貼簿');
  }

  async function deleteItem() {
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

  // 取得 Link 預覽
  async function fetchLinkPreview() {
    if (!url.trim()) {
      toast.error('請先輸入網址');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error('網址格式不正確，請以 http(s):// 開頭');
      return;
    }
    try {
      setPreviewLoading(true);
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        toast.info('此連結的網站拒絕預覽（如 Threads/IG/FB）。請手動填入標題與內容。');
        setPreview(null);
        return;
      }
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || '取得預覽失敗，請手動填入標題與內容');
        setPreview(null);
        return;
      }

      const p: LinkPreview = json.preview || {};
      setPreview(p);
      if (!title && p.title) setTitle(p.title);
      if (!rawContent && p.description) setRawContent(p.description);
      toast.success('已取得連結預覽');
    } catch (e: any) {
      console.error(e);
      toast.error('取得預覽失敗，請手動填入標題與內容');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  // 儲存更新
  async function saveChanges() {
    if (!item) return;

    // 基本驗證
    if (type === 'link' && url && !/^https?:\/\//i.test(url)) {
      toast.error('網址格式不正確，請以 http(s):// 開頭');
      return;
    }

    try {
      // 更新 items
      const categories = categoryInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const { error: upErr } = await supabase
        .from('items')
        .update({
          type,
          title: title || null,
          raw_content: rawContent || null,
          url: type === 'link' ? (url || null) : null,
          category: categories.length ? categories : null,
        })
        .eq('id', item.id);

      if (upErr) throw upErr;

      // 上傳新圖片（如有）
      if (files && files.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('尚未登入');
          return;
        }
        let index = 0;
        const failed: string[] = [];
        for (const file of Array.from(files)) {
          index += 1;
          const path = `${user.id}/${item.id}-${Date.now()}-${index}-${safeName(file.name)}`;
          const { error: uploadError } = await supabase
            .storage
            .from('prompt-images')
            .upload(path, file, { cacheControl: '3600', upsert: false });
          if (uploadError) {
            console.error(uploadError);
            failed.push(file.name);
            continue;
          }
          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            const { error: assetError } = await supabase
              .from('prompt_assets')
              .insert({ item_id: item.id, image_url: pub.publicUrl, storage_path: path });
            if (assetError) {
              console.error(assetError);
              failed.push(file.name);
            }
          }
        }
        if (failed.length) toast.error(`有部分圖片上傳失敗：${failed.join('、')}`);
      }

      // 若是 Link，且有預覽圖（外部 URL），也寫入 prompt_assets
      if (type === 'link' && preview?.image) {
        await supabase
          .from('prompt_assets')
          .insert({ item_id: item.id, image_url: preview.image, storage_path: null })
          .then(({ error }) => {
            if (error) {
              console.error(error);
              toast.message('預覽圖片未能寫入資料庫（不影響儲存）');
            }
          });
      }

      toast.success('已儲存');
      setEditing(false);
      await fetchItem(item.id);
    } catch (e: any) {
      console.error(e);
      toast.error('儲存失敗：' + (e?.message ?? '未知錯誤'));
    }
  }

  // 刪除單張圖片
  async function deleteAsset(asset: AssetRow) {
    const ok = confirm('確認刪除此圖片？');
    if (!ok) return;

    try {
      // 先刪資料列
      const { error: delRowErr } = await supabase
        .from('prompt_assets')
        .delete()
        .eq('id', asset.id);
      if (delRowErr) throw delRowErr;

      // 若有 storage_path，再刪 Storage 檔案（沒有就略過）
      if (asset.storage_path) {
        const { error: delFileErr } = await supabase
          .storage
          .from('prompt-images')
          .remove([asset.storage_path]);
        if (delFileErr) console.warn('storage remove warn:', delFileErr.message);
      }

      toast.success('圖片已刪除');
      if (item) await fetchItem(item.id);
    } catch (e: any) {
      console.error(e);
      toast.error('刪除圖片失敗：' + (e?.message ?? '未知錯誤'));
    }
  }

  // 重算 30 字提示（會納入最新圖片與內容）
  async function recomputeTip() {
    if (!item) return;
    try {
      setRecomputingTip(true);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '提示失敗');
      toast.success('已重新產生提示');
      await fetchItem(item.id);
    } catch (e: any) {
      toast.error(e?.message ?? '提示失敗');
    } finally {
      setRecomputingTip(false);
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

  const categories = item.category ?? [];

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
            {!editing ? (
              <>
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
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  編輯
                </Button>
                <Button variant="destructive" onClick={deleteItem}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  刪除
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4 mr-2" />
                  取消
                </Button>
                <Button onClick={saveChanges}>
                  <Save className="h-4 w-4 mr-2" />
                  儲存
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                {item.type === 'prompt' ? 'Prompt' : '連結'}
              </Badge>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {categories.map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>

            {item.summary_tip && (
              <p className="mt-2 text-sm text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded">
                AI摘要：{item.summary_tip}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {!editing ? (
              <>
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

                {/* 圖片資產 */}
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

                <div className="pt-2">
                  <Button variant="outline" onClick={recomputeTip} disabled={recomputingTip}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {recomputingTip ? '重算中…' : '重算提示（30 字）'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 類型 */}
                <div className="space-y-1">
                  <Label>類型</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={type === 'prompt' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType('prompt')}
                    >
                      Prompt
                    </Button>
                    <Button
                      type="button"
                      variant={type === 'link' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setType('link')}
                    >
                      Link
                    </Button>
                  </div>
                </div>

                {/* 標題 */}
                <div className="space-y-1">
                  <Label>標題</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="可留空" />
                </div>

                {/* 連結（僅 link 類型顯示），含「取得預覽」 */}
                {type === 'link' && (
                  <div className="space-y-2">
                    <Label>網址</Label>
                    <div className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://..."
                        inputMode="url"
                      />
                      <Button type="button" variant="outline" onClick={fetchLinkPreview} disabled={previewLoading}>
                        {previewLoading ? '讀取中…' : '取得預覽'}
                      </Button>
                    </div>

                    {preview && (
                      <div className="mt-2 rounded border p-3 text-sm bg-gray-50">
                        <div className="font-medium mb-1">預覽</div>
                        {preview.image && (
                          <img
                            src={preview.image}
                            alt="link preview"
                            className="w-full max-h-40 object-cover rounded mb-2"
                          />
                        )}
                        <div className="text-gray-800">
                          <div><span className="text-gray-500">標題：</span>{preview.title || '—'}</div>
                          <div className="mt-1 whitespace-pre-wrap">
                            <span className="text-gray-500">描述：</span>{preview.description || '—'}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 break-all">{preview.url || url}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* 內容 */}
                <div className="space-y-1">
                  <Label>{type === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
                  <Textarea
                    value={rawContent}
                    onChange={(e) => setRawContent(e.target.value)}
                    rows={5}
                  />
                </div>

                {/* 分類 */}
                <div className="space-y-1">
                  <Label>分類（逗號分隔）</Label>
                  <Input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="例如：行銷, 個人成長"
                  />
                </div>

                {/* 新增圖片 */}
                <div className="space-y-1">
                  <Label>新增圖片（可多選）</Label>
                  <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
                  <p className="text-xs text-gray-500">支援多張，單張上限 5MB。</p>
                </div>

                {/* 既有圖片 + 刪除鈕 */}
                {assets.length > 0 && (
                  <div className="space-y-2">
                    <Label>已上傳圖片</Label>
                    <div className="grid gap-4 md:grid-cols-2">
                      {assets.map((a) => (
                        <div key={a.id} className="border rounded p-2 bg-white">
                          {a.image_url ? (
                            <img
                              src={a.image_url}
                              alt="asset"
                              className="rounded max-h-64 w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="text-xs text-gray-400">（無圖）</div>
                          )}
                          <div className="mt-2 flex justify-end">
                            <Button variant="destructive" size="sm" onClick={() => deleteAsset(a)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              刪除此圖
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
