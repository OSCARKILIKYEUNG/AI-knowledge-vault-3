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

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('尚未登入');
        return;
      }

      // 驗證圖片
      if (type === 'prompt' && files && files.length > 0) {
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

      // 建立 item
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
        toast.error('建立項目失敗：' + insertError?.message);
        return;
      }

      // 上傳圖片（多張）
      if (type === 'prompt' && files && files.length > 0) {
        for (const file of Array.from(files)) {
          const path = `${user.id}/${insertData.id}-${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase
            .storage
            .from('prompt-images')
            .upload(path, file, { cacheControl: '3600', upsert: false });

          if (uploadError) {
            console.error(uploadError);
            toast.error(`圖片上傳失敗：${file.name}`);
            continue;
          }

          const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
          if (pub?.publicUrl) {
            const { error: assetError } = await supabase
              .from('prompt_assets')
              .insert({ item_id: insertData.id, image_url: pub.publicUrl });

            if (assetError) {
              console.error(assetError);
              toast.error('圖片資料儲存失敗');
            }
          }
        }
      }

      // 非同步觸發摘要
      fetch('/api/process-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: insertData.id }),
      }).catch(() => {});

      toast.success('已新增');
      setTimeout(() => onItemAdded(), 800);
      onOpenChange(false);
      setTitle(''); setRawContent(''); setUrl(''); setCategoryInput(''); setFiles(null);
    } catch (e) {
      console.error(e);
      toast.error('發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !loading && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader><DialogTitle>新增項目</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={type === 'prompt' ? 'default' : 'outline'} size="sm" onClick={() => setType('prompt')}>Prompt</Button>
            <Button type="button" variant={type === 'link' ? 'default' : 'outline'} size="sm" onClick={() => setType('link')}>Link</Button>
          </div>

          <div className="space-y-2">
            <Label>標題</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="可留空" />
          </div>

          {type === 'link' && (
            <div className="space-y-2">
              <Label>網址</Label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}

          <div className="space-y-2">
            <Label>{type === 'prompt' ? 'Prompt 內容' : '備註/描述'}</Label>
            <Textarea value={rawContent} onChange={e => setRawContent(e.target.value)} rows={4} />
          </div>

          <div className="space-y-2">
            <Label>分類（逗號分隔）</Label>
            <Input value={categoryInput} onChange={e => setCategoryInput(e.target.value)} placeholder="例如：行銷, 個人成長" />
          </div>

          {type === 'prompt' && (
            <div className="space-y-2">
              <Label>圖片（可多選）</Label>
              <Input type="file" accept="image/*" multiple onChange={e => setFiles(e.target.files)} />
              <p className="text-xs text-gray-500">支援多張，單張上限 5MB。</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>取消</Button>
            <Button disabled={loading} onClick={handleSubmit}>{loading ? '處理中...' : '建立'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
