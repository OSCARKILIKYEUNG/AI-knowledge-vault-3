'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

import {
  Brain, ArrowLeft, Copy, Trash2, ExternalLink, PencilLine, ImageOff
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type ItemRow = Database['public']['Tables']['items']['Row'];
type AssetRow = { id: number; image_url: string | null; storage_path: string | null };

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id[0] : '';
  const itemId = useMemo(() => Number(rawId), [rawId]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<ItemRow | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  // 編輯
  const [openEdit, setOpenEdit] = useState(false);
  const [editType, setEditType] = useState<'prompt' | 'link'>('prompt');
  const [editTitle, setEditTitle] = useState('');
  const [editRaw, setEditRaw] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editCats, setEditCats] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);

  useEffect(() => {
    if (!Number.isFinite(itemId)) {
      toast.error('無效的項目 ID');
      router.replace('/dashboard');
      return;
    }
    void fetchItem(itemId);
  }, [itemId, router]);

  const fetchItem = async (id: number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('items').select('*').eq('id', id).single();
      if (error || !data) {
        toast.error('找不到項目');
        router.replace('/dashboard');
        return;
      }
      setItem(data);

      const { data: imgs } = await supabase
        .from('prompt_assets')
        .select('id,image_url,storage_path')
        .eq('item_id', id);
      setAssets(imgs || []);
    } catch (e) {
      console.error(e);
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

  const handleDeleteItem = async () => {
    if (!item) return;
    if (!confirm('確定要刪除此項目？')) return;
    const { error } = await supabase.from('items').delete().eq('id', item.id as any);
    if (error) { toast.error('刪除失敗'); return; }
    toast.success('已刪除');
    router.replace('/dashboard');
  };

  // 刪除單張圖片（DB + Storage）
  const handleDeleteImage = async (asset: AssetRow) => {
    if (!asset?.id) return;
    if (!confirm('刪除此圖片？')) return;

    // 先刪 DB
    const { error: delErr } = await supabase.from('prompt_assets').delete().eq('id', asset.id);
    if (delErr) { toast.error('刪除圖片資料失敗'); return; }

    // 再刪 Storage（有 storage_path 才能刪）
    if (asset.storage_path) {
      const { error: rmErr } = await supabase.storage.from('prompt-images').remove([asset.storage_path]);
      if (rmErr) {
        // DB 已刪，Storage 失敗就提示但不 rollback
        toast.error('Storage 檔案刪除失敗（已移除資料列）');
      }
    }

    setAssets(prev => prev.filter(a => a.id !== asset.id));
    toast.success('已刪除圖片');
  };

  // 開啟編輯
  const openEditModal = () => {
    if (!item) return;
    setEditType((item.type as 'prompt' | 'link') || 'prompt');
    setEditTitle(item.title || '');
    setEditRaw(item.raw_content || '');
    setEditUrl(item.url || '');
    setEditCats((item.category || []).join(', '));
    setNewFiles(null);
    setOpenEdit(true);
  };

  const saveEdit = async () => {
    if (!item) return;
    setEditLoading(true);
    try {
      const cats = editCats.split(',').map(s => s.trim()).filter(Boolean);
      const patch: Partial<ItemRow> = {
        type: editType,
        title: editTitle || null,
        raw_content: editRaw || null,
        url: editType === 'link' ? (editUrl || null) : null,
        category: cats.length ? cats : null,
      };

      const { data: updated, error: upErr } = await supabase
        .from('items')
        .update(patch).eq('id', item.id as any)
        .select().single();
      if (upErr) { toast.error('更新失敗'); return; }

      // 新增圖片
      if (editType === 'prompt' && newFiles && newFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.error('尚未登入'); return; }

        const appended: AssetRow[] = [];
        for (const file of Array.from(newFiles)) {
          if (!file.type.startsWith('image/')) { toast.error(`僅支援圖片檔：${file.name}`); continue; }
          if (file.size > 5 * 1024 * 1024) { toast.error(`圖片過大（>5MB）：${file.name}`); continue; }

          const path = `${user.id}/${item.id}-${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage.from('prompt-images')
            .upload(path, file, { cacheControl: '3600', upsert: false });
          if (uploadErr) { toast.error(`上載失敗：${file.name}`); continue; }

          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            const { data: ins, error: insErr } = await supabase
              .from('prompt_assets')
              .insert({ item_id: item.id as any, image_url: pub.publicUrl, storage_path: path })
              .select().single();
            if (!insErr && ins) appended.push(ins as AssetRow);
          }
        }
        if (appended.length) setAssets(prev => [...prev, ...appended]);
      }

      setItem(updated as ItemRow);
      toast.success('已更新');
      setOpenEdit(false);
    } finally {
      setEditLoading(false);
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
        {/* 頂部 */}
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
            <Button variant="outline" onClick={openEditModal}>
              <PencilLine className="h-4 w-4 mr-2" />
              編輯
            </Button>
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

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                {item.type === 'prompt' ? 'Prompt' : '連結'}
              </Badge>
              {item.category && item.category.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.category.map(cat => (
                    <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                  ))}
                </div>
              )}
            </div>
            <CardTitle className="text-xl">{item.title || '（無標題）'}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">建立於：{formatDate(item.created_at)}</p>
            {item.summary_tip && (
              <p className="mt-2 text-sm text-blue-700 bg-blue-50 inline-block px-2 py-1 rounded">
                提示：{item.summary_tip}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {item.url && (
              <div>
                <h3 className="font-medium mb-2">原始連結</h3>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 inline-flex items-center gap-1 hover:underline break-all">
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

            {/* 圖片清單（含刪除） */}
            {assets.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">圖片</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {assets.filter(a => a.image_url).map((a) => (
                    <div key={a.id} className="border rounded p-2 bg-white relative">
                      <img
                        src={a.image_url as string}
                        alt="prompt asset"
                        className="rounded max-h-64 w-full object-contain"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => handleDeleteImage(a)}
                      >
                        <ImageOff className="h-4 w-4 mr-1" />
                        刪除
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 編輯 Modal */}
      <Dialog open={openEdit} onOpenChange={(v) => !editLoading && setOpenEdit(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>編輯項目</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>類型</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editType === 'prompt' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditType('prompt')}
                >Prompt</Button>
                <Button
                  type="button"
                  variant={editType === 'link' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditType('link')}
                >Link</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>標題</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>

            {editType === 'link' && (
              <div className="space-y-2">
                <Label>網址</Label>
                <Input placeholder="https://..." value={editUrl} onChange={e => setEditUrl(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label>{editType === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
              <Textarea rows={5} value={editRaw} onChange={e => setEditRaw(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>分類（以逗號分隔）</Label>
              <Input placeholder="例如：行銷, 個人成長" value={editCats} onChange={e => setEditCats(e.target.value)} />
            </div>

            {editType === 'prompt' && (
              <div className="space-y-2">
                <Label>新增圖片（可多選，單張 ≤ 5MB）</Label>
                <Input type="file" multiple accept="image/*" onChange={e => setNewFiles(e.target.files)} />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={editLoading} onClick={() => setOpenEdit(false)}>取消</Button>
              <Button disabled={editLoading} onClick={saveEdit}>{editLoading ? '儲存中…' : '儲存變更'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
