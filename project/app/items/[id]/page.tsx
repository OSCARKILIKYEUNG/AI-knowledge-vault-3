'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { formatDate } from '@/lib/utils';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Brain,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

// === 型別 ===
type ItemRow = Database['public']['Tables']['items']['Row'] & {
  summary_tip?: string | null; // 資料庫已有此欄位
};
type PromptAsset = {
  id: number;
  item_id: number;
  image_url: string | null;
  storage_path: string | null; // 用來判斷是否需要刪除 Storage 檔案
};

// === 常數 ===
const BUCKET = 'prompt-images';

// 安全檔名
function safeName(name: string) {
  return name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();
}

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const itemId = typeof rawId === 'string' ? Number(rawId) : NaN;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<PromptAsset[]>([]);

  // 編輯欄位
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
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

      const { data: row, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (error || !row) {
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }

      const it = row as ItemRow;
      setItem(it);
      setTitle(it.title ?? '');
      setRawContent(it.raw_content ?? '');
      setUrl(it.url ?? '');
      setCategoryInput((it.category ?? []).join(', '));

      const { data: imgs, error: imgErr } = await supabase
        .from('prompt_assets')
        .select('id,item_id,image_url,storage_path')
        .eq('item_id', itemId)
        .order('id', { ascending: true });

      if (!imgErr) setAssets((imgs ?? []) as PromptAsset[]);
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  // 儲存基本資料
  async function handleSave() {
    if (!item) return;
    try {
      setSaving(true);

      // 驗證 URL
      if (url && !/^https?:\/\//i.test(url)) {
        toast.error('網址格式不正確，請以 http(s):// 開頭');
        return;
      }

      const cats = categoryInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('items')
        .update({
          title: title || null,
          raw_content: rawContent || null,
          url: url || null,
          category: cats.length ? cats : null,
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success('已儲存');
      await reloadItem();
    } catch (e: any) {
      console.error(e);
      toast.error('儲存失敗：' + (e?.message ?? '未知錯誤'));
    } finally {
      setSaving(false);
    }
  }

  // 上傳圖片（多張）
  async function handleUploadImages(files: FileList | null) {
    if (!files || !item) return;
    try {
      setUploading(true);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        toast.error('尚未登入');
        return;
      }

      const failed: string[] = [];
      const succeed: string[] = [];
      let idx = 0;

      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) {
          failed.push(`${f.name}（非圖片）`);
          continue;
        }
        if (f.size > 5 * 1024 * 1024) {
          failed.push(`${f.name}（>5MB）`);
          continue;
        }

        idx += 1;
        const path = `${userId}/${item.id}-${Date.now()}-${idx}-${safeName(f.name)}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { cacheControl: '3600', upsert: false });

        if (upErr) {
          console.error(upErr);
          failed.push(f.name);
          continue;
        }

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl;

        if (!publicUrl) {
          failed.push(f.name);
          continue;
        }

        const { error: dbErr } = await supabase
          .from('prompt_assets')
          .insert({
            item_id: item.id,
            image_url: publicUrl,
            storage_path: path,
          });

        if (dbErr) {
          console.error(dbErr);
          failed.push(f.name);
        } else {
          succeed.push(f.name);
        }
      }

      if (succeed.length) toast.success(`已上傳：${succeed.join('、')}`);
      if (failed.length) toast.error(`失敗：${failed.join('、')}`);

      await reloadItem();
    } catch (e: any) {
      console.error(e);
      toast.error('上傳失敗：' + (e?.message ?? '未知錯誤'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // 刪除單張圖片
  async function handleDeleteImage(asset: PromptAsset) {
    const ok = confirm('確定要刪除此圖片？');
    if (!ok) return;

    try {
      // 先刪 DB
      const { error: delErr } = await supabase
        .from('prompt_assets')
        .delete()
        .eq('id', asset.id);

      if (delErr) throw delErr;

      // 若是自己上傳到 Storage 的，storage_path 才會有值
      if (asset.storage_path) {
        await supabase.storage.from(BUCKET).remove([asset.storage_path]).catch(() => {});
      }

      toast.success('已刪除圖片');
      await reloadItem();
    } catch (e: any) {
      console.error(e);
      toast.error('刪除圖片失敗：' + (e?.message ?? '未知錯誤'));
    }
  }

  // 重算 30 字摘要（會把最新圖片一併考慮）
  async function recomputeTip() {
    try {
      setRecomputing(true);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: Number(itemId) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '重算失敗');
      toast.success('AI 摘要已更新');
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    } finally {
      setRecomputing(false);
    }
  }

  // 複製
  async function copyContent() {
    if (!item) return;
    await navigator.clipboard.writeText(item.raw_content ?? '');
    toast.success('內容已複製到剪貼簿');
  }
  async function copySummary() {
    if (!item?.summary) return;
    await navigator.clipboard.writeText(item.summary);
    toast.success('摘要已複製到剪貼簿');
  }

  // 刪除整個項目
  async function handleDeleteItem() {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？（圖片中存到 Storage 的也會一併刪除）');
    if (!ok) return;

    try {
      // 刪 DB items 前，先清理 Storage（僅刪有 storage_path 的）
      const { data: imgs } = await supabase
        .from('prompt_assets')
        .select('id,storage_path')
        .eq('item_id', item.id);

      const paths = (imgs ?? [])
        .map((a: any) => a?.storage_path)
        .filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
      }

      // 刪除 prompt_assets（如果有 FK ON DELETE CASCADE 可省略）
      await supabase.from('prompt_assets').delete().eq('item_id', item.id);

      // 刪 items
      const { error } = await supabase.from('items').delete().eq('id', item.id);
      if (error) throw error;

      toast.success('已刪除項目');
      router.replace('/dashboard');
    } catch (e: any) {
      console.error(e);
      toast.error('刪除失敗：' + (e?.message ?? '未知錯誤'));
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
        {/* 返回 + 標題列 */}
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
            <Button variant="destructive" onClick={handleDeleteItem}>
              <Trash2 className="h-4 w-4 mr-2" />
              刪除
            </Button>
          </div>
        </div>

        {/* 主要卡片 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                {item.type === 'prompt' ? 'Prompt' : '連結'}
              </Badge>
              {item.category && item.category.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.category.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>

            {/* 30 字內 AI 摘要 + 重算按鈕 */}
            <div className="mt-3 flex items-center gap-2">
              <p className="text-sm text-blue-700 bg-blue-50 inline-flex items-center px-2 py-1 rounded min-h-[28px]">
                {item.summary_tip ? `提示：${item.summary_tip}` : '提示：尚未產生'}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={recomputeTip}
                disabled={recomputing}
                title="以最新圖片與內容重算 30 字內摘要"
              >
                {recomputing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    重算中…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重算摘要
                  </>
                )}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 連結 */}
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

            {/* 編輯表單 */}
            <div className="grid gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">標題</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="可留空"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">連結（http(s)://）</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">內容</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm min-h-[120px]"
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  placeholder="輸入內容或備註"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">分類（以逗號分隔）</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  placeholder="例如：行銷, 個人成長"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      儲存中…
                    </>
                  ) : (
                    '儲存'
                  )}
                </Button>
              </div>
            </div>

            {/* 圖片清單 */}
            <div>
              <h3 className="font-medium mb-2">圖片</h3>
              {assets.length === 0 ? (
                <p className="text-sm text-gray-500">尚未上傳圖片。</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
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
                        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                          無可用連結
                        </div>
                      )}
                      <div className="mt-2 flex justify-between items-center">
                        <span className="text-xs text-gray-500 break-all">
                          {a.storage_path ? '（自有檔）' : '（外部圖）'}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteImage(a)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          刪除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 上傳區 */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleUploadImages(e.target.files)}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title="上傳多張圖片"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      上傳中…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      上傳圖片
                    </>
                  )}
                </Button>
                <span className="text-xs text-gray-500">支援多張、單張上限 5MB。</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
