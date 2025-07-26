'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { Brain, FileText, Link as LinkIcon, LogOut, SearchIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AddItemModal } from '@/components/AddItemModal';
import { toast } from 'sonner';
import { formatDate, truncateText } from '@/lib/utils';

type ItemRow = Database['public']['Tables']['items']['Row'];
type ItemWithAssets = ItemRow & { prompt_assets?: { image_url: string | null }[] };

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();

  // 資料
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<ItemWithAssets[]>([]);
  const [filtered, setFiltered] = useState<ItemWithAssets[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // UI 狀態
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 提示內容：用「字串鍵」避免 bigint/number 型別不一致
  const [hintById, setHintById] = useState<Record<string, string>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      setUser(user);
      await supabase.from('users').upsert({ id: user.id, email: user.email || '' }).select();
      await loadItems();
    })().catch((e) => {
      console.error(e);
      toast.error('載入失敗');
      router.replace('/login');
    });
  }, [router]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('items')
        .select('id,user_id,type,title,raw_content,url,summary,category,created_at, prompt_assets(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data || []) as ItemWithAssets[];
      setItems(list);

      // 把 DB 中既有 summary 帶入本地
      const seed: Record<string, string> = {};
      list.forEach(i => {
        const key = String(i.id);
        if (i.summary) seed[key] = i.summary;
      });
      setHintById(seed);

      // 類別
      const allCats = list.flatMap(i => i.category || []);
      setCategories(Array.from(new Set(allCats)));

      // 初始過濾結果
      setFiltered(list);
    } catch (e) {
      console.error(e);
      toast.error('讀取項目失敗');
    } finally {
      setLoading(false);
    }
  };

  // 搜尋 & 篩選
  useEffect(() => {
    let arr = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      arr = arr.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.raw_content || '').toLowerCase().includes(q) ||
        (i.summary || '').toLowerCase().includes(q) ||
        (hintById[String(i.id)] || '').toLowerCase().includes(q)
      );
    }
    if (selectedCategory) {
      arr = arr.filter(i => i.category?.includes(selectedCategory));
    }
    setFiltered(arr);
  }, [items, searchQuery, selectedCategory, hintById]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // 產生 AI 提示（包含圖片 + 內容，≈30字），即時顯示 + 寫回 DB
  const handleSummarize = async (item: ItemWithAssets) => {
    const key = String(item.id);
    if (summarizingId) return;
    setSummarizingId(key);

    try {
      const images =
        (item.prompt_assets || [])
          .map(a => a.image_url)
          .filter((u): u is string => !!u)
          .slice(0, 2);

      const payload = {
        title: item.title || '',
        description: (item.raw_content || item.url || ''),
        images, // 後端會判斷是否有圖，沒有就只用文字
      };

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(`提示失敗：${data?.error || res.statusText}`);
        return;
      }

      const summary: string = data.summary?.trim() || '（無摘要）';

      // 1) 先即時顯示在畫面
      setHintById(prev => ({ ...prev, [key]: summary }));

      // 同步 items / filtered 的 summary 欄位（用字串 id 比對）
      setItems(prev => prev.map(it => (String(it.id) === key ? { ...it, summary } : it)));
      setFiltered(prev => prev.map(it => (String(it.id) === key ? { ...it, summary } : it)));

      // 2) 寫回 DB
      const { error: upErr } = await supabase
        .from('items')
        .update({ summary })
        .eq('id', item.id as any); // bigint/number 讓 Supabase 自行處理

      if (upErr) {
        console.warn('寫回摘要失敗：', upErr.message);
      }

      toast.success(`已產生提示：${summary.slice(0, 20)}${summary.length > 20 ? '…' : ''}`);
    } catch (e: any) {
      console.error(e);
      toast.error(`提示失敗：${e?.message || String(e)}`);
    } finally {
      setSummarizingId(null);
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

  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">AI Knowledge Vault</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Avatar>
                <AvatarFallback>{user?.email?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button variant="ghost" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                登出
              </Button>
            </div>
          </div>
        </header>

        {/* Main */}
        <div className="container mx-auto px-4 py-8">
          {/* Search + Actions */}
          <div className="mb-8 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜尋知識庫..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => setShowAdd(true)}>新增項目</Button>
            </div>

            {/* Category filters */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedCategory === '' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('')}
                >
                  全部
                </Button>
                {categories.map((c) => (
                  <Button
                    key={c}
                    variant={selectedCategory === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {items.length === 0 ? '開始建立您的知識庫' : '找不到相關項目'}
              </h3>
              <p className="text-gray-600 mb-4">
                {items.length === 0
                  ? '新增您的第一個項目來開始使用 AI Knowledge Vault'
                  : '嘗試不同的搜尋關鍵字或篩選條件'}
              </p>
              {items.length === 0 && (
                <Button onClick={() => setShowAdd(true)}>新增項目</Button>
              )}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => {
                const key = String(item.id);
                const firstImage = item.prompt_assets?.[0]?.image_url || '';
                const hint = hintById[key] || item.summary || '';

                return (
                  <Card key={key} className="h-full hover:shadow-lg transition-shadow">
                    <CardHeader>
                      {/* 首張圖片 */}
                      {firstImage && (
                        <div className="mb-3">
                          <img
                            src={firstImage}
                            alt={item.title || '預覽圖'}
                            className="w-full h-40 object-cover rounded-md"
                          />
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {item.type === 'prompt'
                            ? <FileText className="h-5 w-5 text-blue-600" />
                            : <LinkIcon className="h-5 w-5 text-green-600" />
                          }
                          <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                            {item.type === 'prompt' ? '提示' : '連結'}
                          </Badge>

                          {/* AI 提示按鈕 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSummarize(item)}
                            disabled={summarizingId === key}
                          >
                            <Sparkles className="h-4 w-4 mr-1" />
                            {summarizingId === key ? '產生中…' : '提示'}
                          </Button>
                        </div>

                        {/* 詳情頁 */}
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/items/${item.id}`}>詳情</Link>
                        </Button>
                      </div>

                      <CardTitle className="text-lg leading-tight mt-2">
                        {truncateText(item.title || '', 60)}
                      </CardTitle>

                      {/* 摘要列：沒有就顯示「尚未產生提示」 */}
                      {hint ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CardDescription className="text-sm cursor-help">
                              {truncateText(hint, 30)}
                            </CardDescription>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {hint}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <CardDescription className="text-sm text-gray-400">
                          尚未產生提示
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-3">
                        {item.category && item.category.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.category.slice(0, 3).map((cat) => (
                              <Badge key={cat} variant="outline" className="text-xs">
                                {cat}
                              </Badge>
                            ))}
                            {item.category.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{item.category.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          {formatDate(item.created_at)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <AddItemModal open={showAdd} onOpenChange={setShowAdd} onItemAdded={loadItems} />
      </div>
    </TooltipProvider>
  );
}
