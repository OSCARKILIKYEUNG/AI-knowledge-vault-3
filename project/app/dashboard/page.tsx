'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddItemModal } from '@/components/AddItemModal';
import { SearchIcon, Plus, LogOut, Brain, FileText, Link as LinkIcon, Wand2 } from 'lucide-react';
import { formatDate, truncateText } from '@/lib/utils';
import { toast } from 'sonner';
import { searchItems } from '@/lib/api';

// ---- 型別 ----
type ItemRow = Database['public']['Tables']['items']['Row'];
type ItemWithAssets = ItemRow & { prompt_assets?: { image_url: string | null }[] };

// 強制動態（避免首頁或快取造成的狀態殘留）
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemWithAssets[]>([]);
  const [filteredItems, setFilteredItems] = useState<ItemWithAssets[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // 用來暫存每張卡片的 AI 簡介： { [itemId]: summary }
  const [aiSummaries, setAiSummaries] = useState<Record<number, string>>({});
  // 正在請求中的 item id（用來切換按鈕 loading）
  const [summarizingId, setSummarizingId] = useState<number | null>(null);

  // ===== Auth 狀態 =====
  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) setUser(session.user);
      else if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  useEffect(() => {
    filterItems();
  }, [items, searchQuery, selectedCategory]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUser(user);
    // 確保 users 表有紀錄
    await supabase.from('users').upsert({ id: user.id, email: user.email! }).select();
  };

  // ===== 取資料 =====
  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setItems((data as ItemWithAssets[]) || []);
      // 取全部分類
      const allCategories = (data || []).flatMap((it: ItemWithAssets) => it.category || []);
      setCategories(Array.from(new Set(allCategories)));
    } catch (e) {
      console.error(e);
      toast.error('載入項目失敗');
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = items;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.raw_content || '').toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q)
      );
    }
    if (selectedCategory) {
      filtered = filtered.filter((item) => item.category?.includes(selectedCategory));
    }
    setFilteredItems(filtered);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      if (!user?.id) return;
      const results = await searchItems(searchQuery, user.id);
      setFilteredItems(results);
    } catch {
      const q = searchQuery.toLowerCase();
      const filtered = items.filter((item) =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.raw_content || '').toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q)
      );
      setFilteredItems(filtered);
    }
  };

  // ===== 連接 /api/summarize 的按鈕處理 =====
  const handleSummarize = async (item: ItemWithAssets, e?: React.MouseEvent) => {
    // 不要觸發 Link 導航
    e?.preventDefault();
    e?.stopPropagation();

    if (!item) return;

    // 準備要丟給 API 的資料
    const title = item.title || '';
    const descSource =
      item.summary ||
      item.raw_content ||
      item.url ||
      ''; // 任一內容來源，避免空字串

    setSummarizingId(item.id as number);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: descSource }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Summarize API 失敗：${res.status} ${txt}`);
      }

      const data = await res.json();
      // 後端已限制 30 字內；再保險截斷一下
      const brief: string = (data.summary || '').slice(0, 30);

      setAiSummaries((prev) => ({ ...prev, [item.id as number]: brief }));
      toast.success('已產生提示');
    } catch (err: any) {
      console.error(err);
      toast.error('AI 提示失敗，請稍後再試');
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

      <div className="container mx-auto px-4 py-8">
        {/* Search & Actions */}
        <div className="mb-8 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜尋知識庫..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch}>搜尋</Button>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新增項目
            </Button>
          </div>

          {/* Category Filters */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === '' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('')}
              >
                全部
              </Button>
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {items.length === 0 ? '開始建立您的知識庫' : '找不到相關項目'}
            </h3>
            <p className="text-gray-600 mb-4">
              {items.length === 0 ? '新增您的第一個項目來開始使用 AI Knowledge Vault' : '嘗試不同的搜尋關鍵字或篩選條件'}
            </p>
            {items.length === 0 && (
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新增項目
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const firstImage = item.prompt_assets?.[0]?.image_url || null;
              const brief = aiSummaries[item.id as number];

              return (
                <Link key={item.id} href={`/items/${item.id}`}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      {/* 首圖 */}
                      {firstImage && (
                        <div className="mb-3">
                          <img
                            src={firstImage}
                            alt="預覽圖"
                            className="w-full h-40 object-cover rounded-md"
                          />
                        </div>
                      )}

                      {/* 卡片頂部：類型 + 提示按鈕 */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          {item.type === 'prompt' ? (
                            <FileText className="h-5 w-5 text-blue-600" />
                          ) : (
                            <LinkIcon className="h-5 w-5 text-green-600" />
                          )}
                          <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                            {item.type === 'prompt' ? '提示' : '連結'}
                          </Badge>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleSummarize(item, e)}
                          disabled={summarizingId === item.id}
                          className="ml-2"
                        >
                          <Wand2 className="h-4 w-4 mr-1" />
                          {summarizingId === item.id ? '產生中…' : '提示'}
                        </Button>
                      </div>

                      {/* AI 30字摘要（有就顯示在標題上方） */}
                      {brief && (
                        <CardDescription className="mt-2 text-[13px] text-blue-700">
                          {brief}
                        </CardDescription>
                      )}

                      <CardTitle className="text-lg leading-tight mt-1">
                        {truncateText(item.title || '', 60)}
                      </CardTitle>

                      {item.summary && (
                        <CardDescription className="text-sm">
                          {truncateText(item.summary || '', 100)}
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
                        <div className="text-xs text-gray-500">{formatDate(item.created_at)}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <AddItemModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onItemAdded={fetchItems}
      />
    </div>
  );
}
