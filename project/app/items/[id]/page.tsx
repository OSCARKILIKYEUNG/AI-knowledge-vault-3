'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Brain, ArrowLeft, Copy, Edit, Trash2, ExternalLink, FileText, Link as LinkIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import Image from 'next/image';

type Item = Database['public']['Tables']['items']['Row'];

export default function ItemDetailPage() {
  const [item, setItem] = useState<Item | null>(null);
  const [similarItems, setSimilarItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    if (params.id) {
      fetchItem();
      fetchSimilarItems();
    }
  }, [params.id]);

  const fetchItem = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setItem(data);
    } catch (error) {
      toast.error('載入項目失敗');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchSimilarItems = async () => {
    if (!item?.embedding) {
      setSimilarItems([]);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('find_similar_items', {
        target_item_id: item.id,
        query_embedding: item.embedding,
        match_threshold: 0.7,
        match_count: 5,
        target_user_id: item.user_id
      });

      if (error) {
        console.error('Error fetching similar items:', error);
        setSimilarItems([]);
      } else {
        setSimilarItems(data || []);
      }
    } catch (error) {
      console.error('Error fetching similar items:', error);
      setSimilarItems([]);
    }
  };

  const copyContent = async () => {
    if (item) {
      await navigator.clipboard.writeText(item.raw_content);
      toast.success('內容已複製到剪貼簿');
    }
  };

  const deleteItem = async () => {
    if (!item) return;
    
    if (confirm('確定要刪除這個項目嗎？')) {
      try {
        const { error } = await supabase
          .from('items')
          .delete()
          .eq('id', item.id);

        if (error) throw error;
        
        toast.success('項目已刪除');
        router.push('/dashboard');
      } catch (error) {
        toast.error('刪除失敗');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">找不到項目</h2>
          <Link href="/dashboard">
            <Button>返回儀表板</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">項目詳情</h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={copyContent}>
              <Copy className="h-4 w-4 mr-2" />
              複製
            </Button>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              編輯
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteItem}>
              <Trash2 className="h-4 w-4 mr-2" />
              刪除
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Main Item Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {item.type === 'prompt' ? (
                    <FileText className="h-6 w-6 text-blue-600" />
                  ) : (
                    <LinkIcon className="h-6 w-6 text-green-600" />
                  )}
                  <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                    {item.type === 'prompt' ? '提示' : '連結'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-500">
                  {formatDate(item.created_at)}
                </div>
              </div>
              <CardTitle className="text-2xl">{item.title}</CardTitle>
              {item.summary && (
                <CardDescription className="text-base leading-relaxed">
                  {item.summary}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {/* URL for link items */}
              {item.url && (
                <div>
                  <h3 className="font-medium mb-2">連結</h3>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center"
                  >
                    {item.url}
                    <ExternalLink className="h-4 w-4 ml-1" />
                  </a>
                </div>
              )}

              {/* Image */}
              {item.image_url && (
                <div>
                  <h3 className="font-medium mb-2">圖片</h3>
                  <div className="relative w-full max-w-lg mx-auto">
                    <Image
                      src={item.image_url}
                      alt={item.title}
                      width={500}
                      height={300}
                      className="rounded-lg border"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                </div>
              )}

              {/* Categories */}
              {item.category && item.category.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">分類</h3>
                  <div className="flex flex-wrap gap-2">
                    {item.category.map((cat) => (
                      <Badge key={cat} variant="outline">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Raw Content */}
              <div>
                <h3 className="font-medium mb-2">原始內容</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                    {item.raw_content}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Similar Items */}
          {similarItems.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">相似項目</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {similarItems.map((similarItem) => (
                  <Link key={similarItem.id} href={`/items/${similarItem.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                          {similarItem.type === 'prompt' ? (
                            <FileText className="h-4 w-4 text-blue-600" />
                          ) : (
                            <LinkIcon className="h-4 w-4 text-green-600" />
                          )}
                          <Badge variant={similarItem.type === 'prompt' ? 'default' : 'secondary'} className="text-xs">
                            {similarItem.type === 'prompt' ? '提示' : '連結'}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm leading-tight">
                          {similarItem.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {similarItem.summary && (
                          <CardDescription className="text-xs line-clamp-2">
                            {similarItem.summary}
                          </CardDescription>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          {formatDate(similarItem.created_at)}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}