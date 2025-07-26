'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddItemModal } from '@/components/AddItemModal';
import {
  SearchIcon,
  Plus,
  LogOut,
  Brain,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import { formatDate, truncateText } from '@/lib/utils';
import { toast } from 'sonner';

// 讓 items Row 可以包含 summary_tip（有的專案 schema 可能沒生成型別）
type ItemBase = Database['public']['Tables']['items']['Row'] & {
  summary_tip?: string | null;
};
// 關聯 prompt_assets 只取 image_url
type ItemWithAssets = ItemBase & {
  prompt_assets?: { image_url: string | null }[];
};

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

  // 產生提示中的卡片 id（避免重複點擊）
  const [summarizingId, setSummarizingId] = useState<number | null>(null);

  // 防止 useEffect 重複初始化
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) setUser(session.user);
        else if (event === 'SIGNED_OUT') router.push('/login');
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (user) fetchItems();
  }, [user]);

  useEffect(() => {
    filterItems();
  }, [items, searchQuery, selectedCategory]);

  // 檢查登入，並確保 users 表有紀錄
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUser(user);
    const { error } = await supabase
      .from('users')
      .upsert({ id: user.id, email: user.email! })
      .select();
    if (error) console.error('Error creating user:', error);
  };

  // 讀資料 + 關聯首張圖
  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data as ItemWithAssets[]) || [];
      setItems(list);

      // 產出分類
      const allCategories = list.flatMap((it) => it.category || []);
      setCategories(Array.from(new Set(allCategories)));
      setFilteredItems(list);
    } catch (e) {
      console.error(e);
      toast.error('載入項目失敗');
    } finally {
      setLoading(false);
    }
  };

  // 僅就地篩選（不打 API）
  const filterItems = () => {
    let filtered = items;
    if (selectedCategory) {
      filtered = filtered.filter((item) =>
        item.category?.includes(selectedCategory)
      );
    }
    // 關鍵字由「標題搜尋」按鈕觸發，這邊不主動處理
    setFilteredItems(filtered);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // ===== 搜尋：A. 標題搜尋（只查 title；不打 AI） =====
  function handleKeywordSearch() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setFilteredItems(items);
      return;
    }
    const r = items.filter((it) =>
      (it.title || '').toLowerCase().includes(q)
    );
    setFilteredItems(r);
  }

  // ===== 搜尋：B. AI 搜尋（語意 + 向量；呼叫 /api/search）=====
  async function handleAISearch() {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, userId: user.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || 'AI 搜尋失敗');
      }
      setFilteredItems(json.results || []);
    } catch (e: any) {
      toast.error(e?.message ?? 'AI 搜尋失敗');
    }
  }

  // ===== 卡片「提示」：呼叫 /api/summarize，產生 30 字內摘要（含圖片）=====
  async function makeTip(itemId: number) {
    try {
      setSummarizingId(itemId);
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '提示失敗');
      }
      // 重新取資料，更新 summary_tip
      await fetchItems();
      toast.success('已產生提示');
    } catch (e: any) {
      toast.error(e?.message ?? '提示失敗');
    } finally {
      setSummarizingId(null);
    }
  }

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
                placeholder="輸入關鍵字（僅查標題）或語意描述（AI 搜尋）..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter 預設做「標題搜尋」
                  if (e.key === 'Enter') handleKeywordSearch();
                }}
                className="pl-10"
              />
            </div>

            <Button onClick={handleKeywordSearch}>標題搜尋</Button>
            <Button variant="outline" onClick={handleAISearch}>
              AI 搜尋
            </Button>

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
              {items.length === 0
                ? '新增您的第一個項目來開始使用 AI Knowledge Vault'
                : '請嘗試不同的關鍵字、篩選或使用 AI 搜尋'}
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
            {filteredItems.map((item) => (
              <Link key={item.id} href={`/items/${item.id}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    {/* 首張圖片 */}
                    {item.prompt_assets?.[0]?.image_url && (
                      <div className="mb-3">
                        <img
                          src={item.prompt_assets[0].image_url as string}
                          alt="預覽圖"
                          className="w-full h-40 object-cover rounded-md"
                        />
                      </div>
                    )}

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {item.type === 'prompt' ? (
                          <FileText className="h-5 w-5 text-blue-600" />
                        ) : (
                          <LinkIcon className="h-5 w-5 text-green-600" />
                        )}
                        <Badge variant={item.type === 'prompt' ? 'default' : 'secondary'}>
                          {item.type === 'prompt' ? '提示' : '連結'}
                        </Badge>
                      </div>

                      {/* 產生提示按鈕（阻止 Link 直接跳頁） */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          if (typeof item.id === 'number') {
                            makeTip(item.id);
                          } else {
                            toast.error('無效的項目 ID');
                          }
                        }}
                        disabled={summarizingId === (item.id as number)}
                        title={item.summary_tip || '按一下產生提示'}
                      >
                        {summarizingId === item.id ? '產生中…' : '提示'}
                      </Button>
                    </div>

                    {/* 標題（hover 顯示完整） */}
                    <CardTitle
                      className="text-lg leading-tight mt-2"
                      title={item.title || ''}
                    >
                      {truncateText(item.title || '', 60)}
                    </CardTitle>

                    {/* 30 字內提示 */}
                    {item.summary_tip && (
                      <CardDescription className="text-sm" title={item.summary_tip}>
                        {truncateText(item.summary_tip, 60)}
                      </CardDescription>
                    )}

                    {/* AI 摘要（可留） */}
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
                      <div className="text-xs text-gray-500">
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
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
