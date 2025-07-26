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

  // 讓檔名更安全：移除空白與特殊字元
  const safeName = (name: string) =>
    name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').toLowerCase();

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

      // 圖片驗證：**兩種類型皆允許上傳**
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

      // 2) 建立 item（無論 prompt/link）
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

      // 3) 上傳圖片（多張，**Link 也可**），並寫入 prompt_assets(image_url, storage_path)
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
                storage_path: path, // 之後刪圖用得到
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

        if (succeed.length) {
          toast.success(`圖片已上傳：${succeed.join('、')}`);
        }
        if (failed.length) {
          toast.error(`有部分圖片失敗：${failed.join('、')}`);
        }
      }

      // 4) 非同步處理
      // - /api/process-item：生成長摘要 / 向量（若你有啟用）
      // - /api/ai-tip：重新計算 30 字提示（會把圖片也納入）
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
      // 稍等伺服器處理，再刷新列表
      setTimeout(() => onItemAdded(), 800);
      onOpenChange(false);

      // reset form
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

          {/* 網址（僅 Link 類型顯示輸入框；但圖片上傳兩種型態都支援） */}
          {type === 'link' && (
            <div className="space-y-2">
              <Label>網址</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                inputMode="url"
              />
            </div>
          )}

          {/* 內容 / 備註 */}
          <div className="space-y-2">
            <Label>{type === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
            <Textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={4}
              placeholder={type === 'prompt' ? '輸入你的提示內容…' : '補充說明…'}
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

          {/* 圖片（**兩種型態都顯示**） */}
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
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={loading} onClick={handleSubmit}>
              {loading ? '處理中…' : '建立'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
