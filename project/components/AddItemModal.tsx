'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { generateSummary, generateEmbedding } from '@/lib/api';

interface AddItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemAdded: () => void;
}

export function AddItemModal({ open, onOpenChange, onItemAdded }: AddItemModalProps) {
  const [type, setType] = useState<'prompt' | 'link'>('prompt');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setType('prompt');
    setTitle('');
    setContent('');
    setUrl('');
    setCategoryInput('');
    setCategories([]);
    setImage(null);
  };

  const addCategory = () => {
    if (categoryInput.trim() && !categories.includes(categoryInput.trim())) {
      setCategories([...categories, categoryInput.trim()]);
      setCategoryInput('');
    }
  };

  const removeCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('圖片大小不能超過 5MB');
        return;
      }
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        toast.error('只支援 JPG 和 PNG 格式');
        return;
      }
      setImage(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('images')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('請填寫必要欄位');
      return;
    }

    if (type === 'link' && !url.trim()) {
      toast.error('連結類型需要提供 URL');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let imageUrl = null;
      if (image) {
        imageUrl = await uploadImage(image);
        if (!imageUrl) {
          toast.error('圖片上傳失敗');
          setLoading(false);
          return;
        }
      }

      // Create the item first
      const { data: item, error } = await supabase
        .from('items')
        .insert({
          user_id: user.id,
          type,
          title: title.trim(),
          raw_content: content.trim(),
          url: type === 'link' ? url.trim() : null,
          category: categories,
          image_url: imageUrl,
        })
        .select()
        .single();

      if (error) throw error;

      // Process AI summary and embedding in background
      processItemInBackground(item.id, content.trim());

      toast.success('項目已建立，正在處理中...');
      resetForm();
      onOpenChange(false);
      onItemAdded();
    } catch (error) {
      console.error('Error creating item:', error);
      toast.error('建立項目失敗');
    } finally {
      setLoading(false);
    }
  };

  const processItemInBackground = async (itemId: string, content: string) => {
    try {
      // Generate summary and embedding
      const [summary, embedding] = await Promise.all([
        generateSummary(content),
        generateEmbedding(content)
      ]);

      // Update the item with AI-generated data
      const { error } = await supabase
        .from('items')
        .update({
          summary,
          embedding
        })
        .eq('id', itemId);

      if (error) {
        console.error('Error updating item with AI data:', error);
      }
    } catch (error) {
      console.error('Error processing item in background:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增項目</DialogTitle>
          <DialogDescription>
            新增提示或連結到您的知識庫
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label>類型</Label>
            <RadioGroup value={type} onValueChange={(value: 'prompt' | 'link') => setType(value)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prompt" id="prompt" />
                <Label htmlFor="prompt">提示 (Prompt)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="link" id="link" />
                <Label htmlFor="link">連結 (Link)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">標題 *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="輸入標題..."
              required
            />
          </div>

          {/* URL for links */}
          {type === 'link' && (
            <div className="space-y-2">
              <Label htmlFor="url">網址 *</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
              />
            </div>
          )}

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">內容 *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={type === 'prompt' ? '輸入您的提示內容...' : '輸入相關描述或筆記...'}
              rows={6}
              required
            />
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>分類標籤</Label>
            <div className="flex space-x-2">
              <Input
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="輸入分類名稱"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
              />
              <Button type="button" onClick={addCategory} variant="outline">
                新增
              </Button>
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {categories.map((category) => (
                  <Badge key={category} variant="secondary" className="cursor-pointer">
                    {category}
                    <X
                      className="h-3 w-3 ml-1"
                      onClick={() => removeCategory(category)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Image Upload (prompt only) */}
          {type === 'prompt' && (
            <div className="space-y-2">
              <Label>圖片 (選填)</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      點擊上傳圖片 (最大 5MB, JPG/PNG)
                    </p>
                    {image && (
                      <p className="text-sm text-green-600 mt-2">
                        已選擇: {image.name}
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '建立中...' : '建立項目'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}