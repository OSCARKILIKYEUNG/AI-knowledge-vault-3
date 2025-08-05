'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import {
  Brain,
  ArrowLeft,
  Copy,
  Trash2,
  ExternalLink,
  Edit3,
  Save,
  X,
  ImagePlus,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type ItemRow = Database['public']['Tables']['items']['Row'];
type AssetRow = {
  id: string;
  item_id: number;
  image_url: string | null;
  storage_path: string | null;
};

function stripTipLabel(s: string | null | undefined) {
  if (!s) return '';
  return s.replace(/^\s*(提示|重點提示|摘要|重點摘要)\s*[:：]\s*/i, '').trim();
}

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const itemId = typeof idParam === 'string' ? Number(idParam) : NaN;

  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 編輯狀態
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);

  // 初始化與載入
  useEffect(() => {
    if (!itemId || Number.isNaN(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    void reloadItem();
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
        router.replace('/dashboard');
        return;
      }
      setItem(data);

      // 載入圖片
      const { data: ps, error: pe } = await supabase
        .from('prompt_assets')
        .select('id,item_id,image_url,storage_path')
        .eq('item_id', itemId)
        .order('id', { ascending: true });

      if (!pe) setAssets(ps || []);

      // 預填編輯欄位
      setTitle(data.title ?? '');
      setRawContent(data.raw_content ?? '');
      setUrl(data.url ?? '');
      setCategoryInput((data.category ?? []).join(', '));
    } catch (e) {
      console.error(e);
      toast.error('載入失敗');
    } finally {
      setLoading(false);
    }
  }

  // 複製
  const copyContent = async () => {
    await navigator.clipboard.writeText(item?.raw_content || '');
    toast.success('內容已複製');
  };
  const copySummary = async () => {
    if (item?.summary) {
      await navigator.clipboard.writeText(item.summary);
      toast.success('摘要已複製');
    }
  };

  // 刪除整個項目
  const handleDeleteItem = async () => {
    if (!item) return;
    const ok = confirm('確定要刪除此項目？（圖片檔需另行清理）');
    if (!ok) return;
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) toast.error('刪除失敗');
    else {
      toast.success('已刪除');
      router.replace('/dashboard');
    }
  };

  // 新增圖片（多張）
  async function uploadNewImages() {
    if (!newFiles || !item) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('尚未登入');
      return;
    }
    const succeed: string[] = [];
    const failed: string[] = [];
    let index = 0;

    const safeName = (name: string) =>
      name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

    for (const file of Array.from(newFiles)) {
      if (!file.type.startsWith('image/')) {
        failed.push(file.name);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        failed.push(file.name);
        continue;
      }
      index += 1;
      const path = `${user.id}/${item.id}-${Date.now()}-${index}-${safeName(file.name)}`;

      const { error: upErr } = await supabase.storage
        .from('prompt-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) {
        console.error(upErr);
        failed.push(file.name);
        continue;
      }
      const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        failed.push(file.name);
        continue;
      }
      const { error: insErr } = await supabase
        .from('prompt_assets')
        .insert({ item_id: item.id, image_url: publicUrl, storage_path: path });
      if (insErr) {
        console.error(insErr);
        failed.push(file.name);
      } else {
        succeed.push(file.name);
      }
    }

    if (succeed.length) toast.success(`已上傳：${succeed.join('、')}`);
    if (failed.length) toast.error(`失敗：${failed.join('、')}`);

    setNewFiles(null);
    await reloadItem();
  }

  // 刪除單張圖片
  async function deleteAsset(a: AssetRow) {
    const ok = confirm('刪除此圖片？');
    if (!ok) return;

    // 先刪 DB
    const { error: delErr } = await supabase
      .from('prompt_assets')
      .delete()
      .eq('id', a.id);
    if (delErr) {
      toast.error('刪除圖片失敗');
      return;
    }

    // 再刪 Storage 檔案（有 storage_path 才刪）
    if (a.storage_path) {
      const { error: stErr } = await supabase.storage
        .from('prompt-images')
        .remove([a.storage_path]);
      if (stErr) {
        // 不致命
        console.warn('Storage remove warn:', stErr.message);
      }
    }

    toast.success('已刪除圖片');
    await reloadItem();
  }

  // 儲存編輯
  async function saveEdit() {
    if (!item) return;
    try {
      setSaving(true);
      // 更新 items
      const categories = categoryInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const { error: upErr } = await supabase
        .from('items')
        .update({
          title: title || null,
          raw_content: rawContent || null,
          url: url || null,
          category: categories.length ? categories : null,
        })
        .eq('id', item.id);
      if (upErr) throw upErr;

      // 上傳新選的圖片
      if (newFiles && newFiles.length > 0) {
        await uploadNewImages();
      }

      toast.success('已儲存');
      setEditing(false);
      await reloadItem();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  // 重算 30 字提示（納入最新圖片/文字）
  async function recomputeTip() {
    try {
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '重算失敗');
      toast.success('AI 提示已更新');
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
    }
  }

  // 重算長摘要（多模態）
  async function recomputeLongSummary() {
    try {
      const res = await fetch('/api/process-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '重算失敗');
      toast.success('AI 長摘要已更新');
      await reloadItem();
    } catch (e: any) {
      toast.error(e?.message ?? '重算失敗');
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

  const tipText = stripTipLabel(item.summary_tip || '');

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
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Edit3 className="h-4 w-4 mr-2" />
                編輯
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setEditing(false); reloadItem(); }}>
                  <X className="h-4 w-4 mr-2" />
                  取消
                </Button>
                <Button onClick={saveEdit} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? '儲存中…' : '儲存'}
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={handleDeleteItem}>
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

            {!editing ? (
              <>
                <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
                <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>

                {/* 單行提示（完整顯示，不截斷；避免「提示」重複） */}
                {tipText && (
                  <p className="mt-2 text-sm text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded whitespace-pre-wrap break-words">
                    <strong>提示：</strong>{tipText}
                  </p>
                )}
              </>
            ) : (
              // 編輯模式：基本欄位
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-sm text-gray-600">標題</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">連結</label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className="text-sm text-gray-600">內容</label>
                  <Textarea rows={6} value={rawContent} onChange={(e) => setRawContent(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">分類（逗號分隔）</label>
                  <Input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="例如：行銷, 個人成長"
                  />
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* 連結（檢視模式） */}
            {!editing && item.url && (
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

            {/* 圖片區 */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-medium mb-2">圖片</h3>
                {/* 重新計算摘要按鈕（納入圖片變動） */}
                {!editing && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={recomputeTip} title="重算 30 字提示">
                      <Sparkles className="h-4 w-4 mr-1" />
                      重算提示
                    </Button>
                    <Button variant="outline" size="sm" onClick={recomputeLongSummary} title="重算長摘要">
                      <Sparkles className="h-4 w-4 mr-1" />
                      重算摘要
                    </Button>
                  </div>
                )}
              </div>

              {assets.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {assets.map((a) => (
                    <div key={a.id} className="border rounded p-2 bg-white">
                      <img
                        src={a.image_url || ''}
                        alt="asset"
                        className="rounded max-h-64 w-full object-contain"
                        loading="lazy"
                      />
                      {editing && (
                        <div className="flex justify-end mt-2">
                          <Button variant="destructive" size="sm" onClick={() => deleteAsset(a)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            刪除圖片
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">目前沒有圖片</p>
              )}

              {editing && (
                <div className="mt-3">
                  <label className="text-sm text-gray-600">新增圖片（可多選）</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setNewFiles(e.target.files)}
                    />
                    <Button type="button" onClick={uploadNewImages} disabled={!newFiles || saving}>
                      <ImagePlus className="h-4 w-4 mr-1" />
                      上傳
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">支援多張，單張上限 5MB。</p>
                </div>
              )}
            </div>

            {/* 內容（完整顯示） */}
            {!editing && (
              <div>
                <h3 className="font-medium mb-2">內容</h3>
                <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm break-words">
                  {item.raw_content || '（無內容）'}
                </pre>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" onClick={copyContent}>
                    <Copy className="h-4 w-4 mr-2" />
                    複製內容
                  </Button>
                </div>
              </div>
            )}

            {/* 長摘要（完整顯示） */}
            {!editing && (item.summary ?? '').trim() && (
              <div>
                <h3 className="font-medium mb-2">AI 摘要</h3>
                <pre className="whitespace-pre-wrap bg-blue-50 p-3 rounded text-sm break-words">
                  {item.summary as string}
                </pre>
                <div className="mt-2">
                  <Button variant="outline" onClick={copySummary}>
                    <Copy className="h-4 w-4 mr-2" />
                    複製摘要
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
