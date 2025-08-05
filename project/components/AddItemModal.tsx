'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

interface AddItemModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onItemAdded: () => void;
}

export function AddItemModal({ open, onOpenChange, onItemAdded }: AddItemModalProps) {
  const [type, setType] = useState<'prompt' | 'link'>('prompt');
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  // link 預覽
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const safeName = (name: string) =>
    name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

  async function fetchLinkPreview() {
    if (!url.trim()) return toast.error('請先輸入網址');
    if (!/^https?:\/\//i.test(url)) return toast.error('網址格式不正確，請以 http(s):// 開頭');

    try {
      setPreviewLoading(true);
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || '取得預覽失敗');

      const p: LinkPreview = json.preview || {};
      setPreview(p);
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

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('尚未登入'); return; }

      if (type === 'link' && url && !/^https?:\/\//i.test(url)) {
        toast.error('網址格式不正確，請以 http(s):// 開頭');
        return;
      }

      if (files && files.length > 0) {
        for (const f of Array.from(files)) {
          if (!f.type.startsWith('image/')) { toast.error(`僅支援圖片檔：${f.name}`); return; }
          if (f.size > 5 * 1024 * 1024) { toast.error(`圖片過大（>5MB）：${f.name}`); return; }
        }
      }

      const categories = categoryInput.split(',').map(s => s.trim()).filter(Boolean);

      // 友善提示：只有圖片或短文
      if (!title.trim() && rawContent.trim().length < 10) {
        toast.message('目前幾乎無文字內容：AI 會僅以圖片產生摘要；建議補 1～2 個關鍵字可更準確。');
      }

      // 建立 item
      const { data: inserted, error: insErr } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          type,
          title: title || null,
          raw_content: rawContent || null,
          url: type === 'link' ? (url || null) : null,
          category: categories.length ? categories : null,
        })
        .select()
        .single();

      if (insErr || !inserted) {
        console.error(insErr);
        toast.error('建立項目失敗：' + (insErr?.message ?? '未知錯誤'));
        return;
      }

      // 上傳使用者圖片
      if (files && files.length > 0) {
        let idx = 0;
        for (const f of Array.from(files)) {
          idx += 1;
          const path = `${user.id}/${inserted.id}-${Date.now()}-${idx}-${safeName(f.name)}`;
          const { error: upErr } = await supabase.storage.from('prompt-images').upload(path, f, {
            cacheControl: '3600',
            upsert: false,
          });
          if (upErr) { console.error(upErr); continue; }
          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            await supabase.from('prompt_assets').insert({
              item_id: inserted.id, image_url: pub.publicUrl, storage_path: path,
            });
          }
        }
      }

      // 若 link 預覽有圖片，直接存外部圖（不下載）
      if (type === 'link' && preview?.image) {
        await supabase.from('prompt_assets').insert({
          item_id: inserted.id, image_url: preview.image, storage_path: null,
        });
      }

      // 非同步處理摘要／AI 提示
      fetch('/api/process-item', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: inserted.id }),
      }).catch(() => {});
      fetch('/api/ai-tip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: inserted.id }),
      }).catch(() => {});

      toast.success('已新增項目');
      setTimeout(() => onItemAdded(), 700);
      onOpenChange(false);

      // reset
      setType('prompt'); setTitle(''); setRawContent(''); setUrl('');
      setCategoryInput(''); setFiles(null); setPreview(null);
    } catch (e: any) {
      console.error(e);
      toast.error('發生錯誤：' + (e?.message ?? '未知錯誤'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增項目</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {/* 類型切換 */}
          <div className="flex gap-2">
            <Button type="button" variant={type === 'prompt' ? 'default' : 'outline'} size="sm" onClick={() => setType('prompt')}>Prompt</Button>
            <Button type="button" variant={type === 'link' ? 'default' : 'outline'} size="sm" onClick={() => setType('link')}>Link</Button>
          </div>

          {/* 標題 */}
          <div className="space-y-2">
            <Label>標題</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="可留空" />
          </div>

          {/* 連結（Link 類型） */}
          {type === 'link' && (
            <div className="space-y-2">
              <Label>網址</Label>
              <div className="flex gap-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." inputMode="url" />
                <Button type="button" variant="outline" onClick={fetchLinkPreview} disabled={previewLoading}>
                  {previewLoading ? '讀取中…' : '取得預覽'}
                </Button>
              </div>
              {preview && (
                <div className="mt-2 rounded border p-3 text-sm bg-gray-50">
                  {preview.image && (
                    <img src={preview.image} alt="preview" className="w-full max-h-40 object-cover rounded mb-2" />
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

          {/* 內容 */}
          <div className="space-y-2">
            <Label>{type === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
            <Textarea value={rawContent} onChange={(e) => setRawContent(e.target.value)} rows={4}
              placeholder={type === 'prompt' ? '輸入你的提示內容…（可留白）' : '補充說明…'} />
            {/* 前端友善提醒（只有圖片或短文） */}
            {(!title.trim() && rawContent.trim().length < 10) && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 inline-block">
                目前幾乎無文字內容：AI 會僅以圖片產生摘要；建議補 1～2 個關鍵字可更準確。
              </p>
            )}
          </div>

          {/* 分類 */}
          <div className="space-y-2">
            <Label>分類（逗號分隔）</Label>
            <Input value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)} placeholder="如：行銷, 個人成長" />
          </div>

          {/* 圖片（兩類型皆可上傳） */}
          <div className="space-y-2">
            <Label>圖片（可多選）</Label>
            <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
            <p className="text-xs text-gray-500">支援多張，單張上限 5MB。</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>取消</Button>
            <Button disabled={loading} onClick={handleSubmit}>{loading ? '處理中…' : '建立'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
