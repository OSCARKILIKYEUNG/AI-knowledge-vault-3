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

export function AddItemModal({ open, onOpenChange, onItemAdded }: AddItemModalProps) {
  const [type, setType] = useState<'prompt' | 'link'>('prompt');
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  // 安全檔名
  const safeName = (name: string) => name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('尚未登入');
        return;
      }

      // 基本驗證
      if (type === 'link' && url && !/^https?:\/\//i.test(url)) {
        toast.error('網址格式不正確，請以 http(s):// 開頭');
        return;
      }
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

      const categories = categoryInput.split(',').map(c => c.trim()).filter(Boolean);

      // ---------- 嘗試取得 Link Preview（僅 link 類型） ----------
      let previewTitle = '';
      let previewDesc = '';
      let previewImageUrl = '';

      if (type === 'link' && url) {
        try {
          const r = await fetch('/api/link-preview?url=' + encodeURIComponent(url), { cache: 'no-store' });
          const j = await r.json();
          if (r.ok && j?.ok) {
            // LinkPreview 的欄位：title, description, image, url
            previewTitle = j.preview?.title ?? '';
            previewDesc = j.preview?.description ?? '';
            previewImageUrl = j.preview?.image ?? '';
          } else {
            // 常見：Threads/IG/FB 403 or 無法預覽
            toast.info('此連結的網站拒絕預覽（如 Threads/IG/FB）。請手動填入標題與內容。');
          }
        } catch {
          toast.info('無法產生連結預覽，請手動填入標題與內容。');
        }
      }

      // ---------- 建立 item ----------
      const { data: insertData, error: insertError } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          type,
          title: (title || previewTitle) || null,
          raw_content: (rawContent || previewDesc) || null,
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

      // ---------- 若有 Link 預覽圖，先寫入 prompt_assets（外部連結，不占 Storage） ----------
      if (type === 'link' && previewImageUrl) {
        await supabase.from('prompt_assets').insert({
          item_id: insertData.id,
          image_url: previewImageUrl,
        });
      }

      // ---------- 上傳使用者選的圖片（多張，prompt/link 都支援） ----------
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

      // ---------- 非同步處理：摘要/向量 & 30 字提示 ----------
      fetch('/api/process-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: insertData.id }),
      }).catch(() => { /* ignore */ });

      fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: insertData.id }),
      }).catch(() => { /* ignore */ });

      toast.success('已新增項目');
      setTimeout(() => onItemAdded(), 800);
      onOpenChange(false);

      // 重設表單
      setType('prompt');
      setTitle('');
      setRawContent('');
      setUrl('');
      setCategoryInput('');
      setFiles(null);
    } catch (e: any) {
      console.error(e);
      toast.error('發生錯誤：' + (e?.message ?? '未知錯誤'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !loading && onOpenChange(v)}>
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
              onChange={e => setTitle(e.target.value)}
              placeholder="可留空（貼連結時會自動帶入預覽標題）"
            />
          </div>

          {/* 網址（僅 Link 類型） */}
          {type === 'link' && (
            <div className="space-y-2">
              <Label>網址</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                inputMode="url"
              />
            </div>
          )}

          {/* 內容 / 備註 */}
          <div className="space-y-2">
            <Label>{type === 'prompt' ? 'Prompt 內容' : '備註 / 內容描述（若留空，會嘗試用預覽描述帶入）'}</Label>
            <Textarea
              value={rawContent}
              onChange={e => setRawContent(e.target.value)}
              rows={4}
              placeholder={type === 'prompt' ? '輸入你的提示內容…' : '（可留空，將嘗試使用連結預覽描述）'}
            />
          </div>

          {/* 分類 */}
          <div className="space-y-2">
            <Label>分類（逗號分隔）</Label>
            <Input
              value={categoryInput}
              onChange={e => setCategoryInput(e.target.value)}
              placeholder="例如：行銷, 個人成長"
            />
          </div>

          {/* 圖片（prompt / link 都允許上傳補圖） */}
          <div className="space-y-2">
            <Label>圖片（可多選）</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={e => setFiles(e.target.files)}
            />
            <p className="text-xs text-gray-500">支援多張，單張上限 5MB。</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={loading} onClick={handleSubmit}>
              {loading ? '處理中...' : '建立'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
