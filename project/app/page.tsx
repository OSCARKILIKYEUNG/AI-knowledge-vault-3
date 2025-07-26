'use client'

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type Item = Database['public']['Tables']['items']['Row'];
type PromptAsset = {
  id: string;
  item_id: string;
  image_url: string;
};

export default function ItemPage() {
  const { id } = useParams();
  const [item, setItem] = useState<Item | null>(null);
  const [images, setImages] = useState<PromptAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchItem(id as string);
  }, [id]);

  const fetchItem = async (itemId: string) => {
    setLoading(true);

    const { data: itemData, error: itemError } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !itemData) {
      console.error(itemError);
      setLoading(false);
      return;
    }

    const { data: imageData } = await supabase
      .from('prompt_assets')
      .select('*')
      .eq('item_id', itemId);

    setItem(itemData);
    setImages(imageData || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        載入中...
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center mt-20 text-gray-500">找不到該項目。</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* 標題與分類 */}
      <div>
        <h1 className="text-2xl font-bold mb-2">{item.title}</h1>
        <p className="text-gray-500 text-sm">{formatDate(item.created_at)}</p>

        {Array.isArray(item.category) && item.category.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {item.category.map((cat) => (
              <Badge key={cat} variant="outline">{cat}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* 圖片展示 */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {images.map((img) => (
            <img
              key={img.id}
              src={img.image_url}
              alt="項目圖片"
              className="w-full h-48 object-cover rounded"
            />
          ))}
        </div>
      )}

      {/* 原始內容 */}
      <div>
        <h2 className="text-lg font-semibold mb-2">內容</h2>
        <p className="whitespace-pre-line text-gray-800">{item.raw_content}</p>
      </div>
    </div>
  );
}
