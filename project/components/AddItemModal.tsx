'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface AddItemModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onItemAdded: () => void;
}

type LinkPreview = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

export function AddItemModal({ open, onOpenChange, onItemAdded }: AddItemModalProps) {
  const [type, setType] = useState<'prompt' | 'link'>('prompt');
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const [loading, setLoading] = useState(false);

  // Link 預覽相關
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const safeName = (name: string) =>
    name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

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

      // 友善訊息：部分網站會拒絕（Threads/IG/FB）
      if (res.status === 401 || res.status === 403) {
        toast.info('此連結的網站拒絕預覽（如 Threads/IG/FB）。請手動填入標題與內容。');
        setPreview(null);
        return; // 不丟錯，讓使用者手動輸入
      }

      if (!res.ok || !json?.ok) {
        toast.error(json?.error || '取得預覽失敗，請手動填入標題與內容');
        setPreview(null);
        return;
      }

      const p: LinkPreview = json.preview || {};
      setPreview(p);

      // 自動帶入標題/描述（可被使用者覆寫）
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

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('尚未登入');
        return;
      }

      // 1) 基本驗證
      if (type === 'link' && url && !/^https?:\/\//i.test(url)) {
        toast.error('網址格式不正確，請以 http(s):// 開頭');
        return;
      }

      // 驗證圖片
      if (files && files.length > 0) {
        for (const f of Array.from(files)) {
          if (!f.type.startsWith('image/')) {
            toast.error(`僅支援圖片檔，檔案：${f.name}`);
            return;
          }
          if (f.size > 5 * 1024 * 1024) {
            toast.error(`圖片過大（>5MB）：${f.name}`);
            return;
          }
        }
      }

      const categories = categoryInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      // 2) 建立 item
      const { data: insertData, error: insertError } = await supabase
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

      if (insertError || !insertData) {
        console.error('Insert error:', insertError);
        toast.error('建立項目失敗：' + (insertError?.message ?? '未知錯誤'));
        return;
      }

      // 3) 上傳使用者選擇的圖片（多張）
      if (files && files.length > 0) {
        const failed: string[] = [];
        const succeed: string[] = [];
        let index = 0;

        for (const file of Array.from(files)) {
          index += 1;
          const path = `${user.id}/${insertData.id}-${Date.now()}-${index}-${safeName(file.name)}`;

          const { error: uploadError } = await supabase
            .storage
            .from('prompt-images')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error(uploadError);
            failed.push(file.name);
            continue;
          }

          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            const { error: assetError } = await supabase
              .from('prompt_assets')
              .insert({
                item_id: insertData.id,
                image_url: pub.publicUrl,
                storage_path: path,
              });
            if (assetError) {
              console.error(assetError);
              failed.push(file.name);
            } else {
              succeed.push(file.name);
            }
          } else {
            failed.push(file.name);
          }
        }

        if (succeed.length) toast.success(`圖片已上傳：${succeed.join('、')}`);
        if (failed.length) toast.error(`有部分圖片失敗：${failed.join('、')}`);
      }

      // 4) 若是 Link 類型且有預覽圖（外部 URL），也寫入 prompt_assets
      if (type === 'link' && preview?.image) {
        const { error: assetError } = await supabase
          .from('prompt_assets')
          .insert({
            item_id: insertData.id,
            image_url: preview.image,
            storage_path: null,
          });
        if (assetError) {
          console.error(assetError);
          toast.message('預覽圖片未能寫入資料庫（不影響項目建立）');
        }
      }

      // 5) 非同步：摘要/向量 & 30字提示（含圖片）
      fetch('/api/process-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: insertData.id }),
      }).catch(() => {});

      fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: insertData.id }),
      }).catch(() => {});

      toast.success('已新增項目');
      setTimeout(() => onItemAdded(), 800);
      onOpenChange(false);

      // reset form
      setType('prompt');
      setTitle('');
      setRawContent('');
      setUrl('');
      setCategoryInput('');
      setFiles(null);
      setPreview(null);
    } catch (e: any) {
      console.error(e);
      toast.error('發生錯誤：' + (e?.message ?? '未知錯誤'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增項目</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 類型切換 */}
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

          {/* 標題 */}
          <div className="space-y-2">
            <Label>標題</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可留空"
            />
          </div>

          {/* 網址（僅 Link 類型） */}
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

          {/* 內容 / 備註 */}
          <div className="space-y-2">
            <Label>{type === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
            <Textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={4}
              placeholder={type === 'prompt' ? '輸入你的提示內容…' : '補充說明…（拿不到預覽時，請在這裡填寫描述）'}
            />
          </div>

          {/* 分類 */}
          <div className="space-y-2">
            <Label>分類（逗號分隔）</Label>
            <Input
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="例如：行銷, 個人成長"
            />
          </div>

          {/* 圖片（兩類型都可上傳） */}
          <div className="space-y-2">
            <Label>圖片（可多選）</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
            <p className="text-xs text-gray-500">支援多張，單張上限 5MB。</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>
              {loading ? '處理中...' : '建立'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
