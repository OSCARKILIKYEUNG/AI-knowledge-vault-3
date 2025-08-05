'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  ArrowLeft, Brain, Copy, ExternalLink, Loader2, Pencil, Save, Trash2, Undo2, ImagePlus, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Asset = {
  id: string;
  item_id: number;
  image_url: string | null;
  storage_path: string | null;
};

type ItemRow = {
  id: number;
  user_id: string;
  type: 'prompt' | 'link';
  title: string | null;
  raw_content: string | null;
  url: string | null;
  summary: string | null;
  summary_tip: string | null;
  category: string[] | null;
  created_at: string;
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
  const itemId = useMemo(() => Number(params?.id), [params?.id]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);

  // 編輯狀態
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [newFiles, setNewFiles] = useState<FileList | null>(null);

  // 連結預覽
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    reloadItem();
  }, [itemId]);

  async function reloadItem() {
    setLoading(true);
    try {
      const { data: itemData, error: itemErr } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();
      if (itemErr || !itemData) throw itemErr;
      setItem(itemData as ItemRow);

      const { data: assetData } = await supabase
        .from('prompt_assets')
        .select('id,item_id,image_url,storage_path')
        .eq('item_id', itemId)
        .order('id', { ascending: true });

      setAssets((assetData as Asset[]) || []);

      // 帶入編輯欄位
      setTitle(itemData.title ?? '');
      setRawContent(itemData.raw_content ?? '');
      setUrl(itemData.url ?? '');
      setCategoryInput((itemData.category ?? []).join(', '));
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  function parseCategories(input: string) {
    return input
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  async function handleSave() {
    if (!item) return;
    try {
      // 基本驗證
      if (url && !/^https?:\/\//i.test(url)) {
        toast.error('網址格式不正確，請以 http(s):// 開頭');
        return;
      }

      const { error: upErr } = await supabase
        .from('items')
        .update({
          title: title || null,
          raw_content: rawContent || null,
          url: url || null,
          category: parseCategories(categoryInput) || null,
        })
        .eq('id', item.id);

      if (upErr) throw upErr;

      // 若有新圖片，上傳 + 寫入 prompt_assets
      if (newFiles && newFiles.length > 0) {
        // 安全檔名
        const safeName = (name: string) =>
          name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

        let i = 0;
        for (const f of Array.from(newFiles)) {
          i += 1;
          if (!f.type.startsWith('image/')) continue;
          if (f.size > 5 * 1024 * 1024) {
            toast.error(`圖片過大（>5MB）：${f.name}`);
            continue;
          }

          const path = `${item.user_id}/${item.id}-${Date.now()}-${i}-${safeName(f.name)}`;
          const { error: uErr } = await supabase.storage.from('prompt-images').upload(path, f, {
            cacheControl: '3600',
            upsert: false,
          });
          if (uErr) {
            console.error(uErr);
            toast.error(`上傳失敗：${f.name}`);
            continue;
          }

          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            const { error: aErr } = await supabase
              .from('prompt_assets')
              .insert({ item_id: item.id, image_url: pub.publicUrl, storage_path: path });
            if (aErr) console.error(aErr);
          }
        }
      }

      toast.success('已儲存');
      setEditing(false);
      setNewFiles(null);
      await reloadItem();
    } catch (e) {
      console.error(e);
      toast.error('儲存失敗');
    }
  }

  async function handleDeleteItem() {
    if (!item) return;
    if (!confirm('確定要刪除此項目？')) return;

    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) {
      toast.error('刪除失敗');
    } else {
      toast.success('已刪除');
      router.replace('/dashboard');
    }
  }

  async function handleDeleteAsset(asset: Asset) {
    if (!confirm('要刪除此圖片嗎？')) return;

    // 先刪 storage（若有路徑）
    if (asset.storage_path) {
      const { error: stErr } = await supabase.storage.from('prompt-images').remove([asset.storage_path]);
      if (stErr) {
        // 不阻塞，繼續刪 DB
        console.warn('storage remove failed:', stErr.message);
      }
    }
    const { error: dbErr } = await supabase.from('prompt_assets').delete().eq('id', asset.id);
    if (dbErr) {
      toast.error('刪除圖片失敗');
    } else {
      toast.success('圖片已刪除');
      await reloadItem();
    }
  }

  async function fetchLinkPreview() {
    const u = url.trim();
    if (!u) return toast.error('請先輸入網址');
    if (!/^https?:\/\//i.test(u)) return toast.error('網址需以 http(s):// 開頭');

    try {
      setPreviewLoading(true);
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '取得預覽失敗');

      const p: LinkPreview = json.preview || {};
      setPreview(p);

      // 若目前為空，幫填
      if (!title && p.title) setTitle(p.title);
      if (!rawContent && p.description) setRawContent(p.description);

      toast.success('已取得連結預覽');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? '取得預覽失敗');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function recomputeTip() {
    try {
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '重算失敗');

      toast.success('AI 摘要已更新');
      if (json.message) toast.message(json.message); // 僅圖片／短文提示
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* 頂部操作列 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  編輯
                </Button>
                <Button variant="destructive" onClick={handleDeleteItem}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  刪除
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setEditing(false); reloadItem(); }}>
                  <Undo2 className="h-4 w-4 mr-2" />
                  取消
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  儲存
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 內容卡 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                {item.type === 'prompt' ? 'Prompt' : '連結'}
              </Badge>
              {(item.category ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(item.category ?? []).map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              )}
            </div>
            {!editing ? (
              <>
                <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
                {/* 詳細頁：完整顯示 summary_tip，不截斷 */}
                {item.summary_tip && (
                  <p className="mt-2 text-sm text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded">
                    提示：{item.summary_tip}
                  </p>
                )}
              </>
            ) : (
              <>
                <Input
                  placeholder="標題"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mb-2"
                />
                {item.summary_tip && (
                  <p className="text-xs text-gray-500">
                    目前提示：{item.summary_tip}
                  </p>
                )}
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 連結區 */}
            {!editing ? (
              item.url && (
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
              )
            ) : (
              <div>
                <h3 className="font-medium mb-2">連結</h3>
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
                  <div className="mt-3 rounded border p-3 text-sm bg-gray-50">
                    {preview.image && (
                      <img src={preview.image} alt="preview" className="w-full max-h-48 object-cover rounded mb-2" />
                    )}
                    <div className="text-gray-800">
                      <div><span className="text-gray-500">標題：</span>{preview.title || '—'}</div>
                      <div className="mt-1 whitespace-pre-wrap">
                        <span className="text-gray-500">描述：</span>{preview.description || '—'}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 break-all">{preview.url}</div>
                  </div>
                )}
              </div>
            )}

            {/* 內容區 */}
            {!editing ? (
              <div>
                <h3 className="font-medium mb-2">內容</h3>
                <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm">
                  {item.raw_content || '（無內容）'}
                </pre>
              </div>
            ) : (
              <div>
                <h3 className="font-medium mb-2">內容</h3>
                <Textarea
                  rows={6}
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  placeholder="可留白；若只有圖片，AI 仍會嘗試從圖片產生摘要。"
                />
                {/* 短文／圖片-only 友善提醒（前端） */}
                {(!title.trim() && rawContent.trim().length < 10) && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2 inline-block">
                    目前幾乎無文字內容：AI 會僅以圖片產生摘要；建議補 1～2 個關鍵字可更準確。
                  </p>
                )}
              </div>
            )}

            {/* 分類 */}
            {!editing ? (
              (item.category ?? []).length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">分類</h3>
                  <div className="flex flex-wrap gap-1">
                    {(item.category ?? []).map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div>
                <h3 className="font-medium mb-2">分類（逗號分隔）</h3>
                <Input
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  placeholder="如：行銷, 個人成長"
                />
              </div>
            )}

            {/* 圖片區：列表 + 新增 + 刪除 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">圖片</h3>
                {editing && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-sm">新增圖片</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => setNewFiles(e.target.files)}
                    />
                  </label>
                )}
              </div>

              {assets.length === 0 ? (
                <p className="text-sm text-gray-500">目前沒有圖片。</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
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
                        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                          無法預覽
                        </div>
                      )}
                      {editing && (
                        <div className="mt-2 flex justify-end">
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteAsset(a)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            刪除
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 重算 AI 簡短摘要（30 字內，會納入圖片） */}
            <div className="pt-2">
              <Button onClick={recomputeTip}>
                <Sparkles className="h-4 w-4 mr-2" />
                重算 AI 摘要（含圖片）
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
