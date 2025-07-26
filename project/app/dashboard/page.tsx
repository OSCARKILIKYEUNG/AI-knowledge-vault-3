'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddItemModal } from '@/components/AddItemModal';
import { Brain, FileText, Link as LinkIcon, LogOut, Plus, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

// ========== 型別（避免因資料庫型別差異導致 TS 編譯錯誤） ==========
type ItemWithAssets = {
  id: number;
  user_id: string;
  type: 'prompt' | 'link';
  title: string | null;
  raw_content: string | null;
  url: string | null;
  summary: string | null;
  summary_tip?: string | null;
  category: string[] | null;
  created_at: string;
  prompt_assets?: { image_url: string | null }[];
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<ItemWithAssets[]>([]);
  const [filteredItems, setFilteredItems] = useState<ItemWithAssets[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [summarizingId, setSummarizingId] = useState<number | null>(null);

  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      // 確保 users 表有紀錄（失敗不阻擋流程）
      await supabase.from('users').upsert({ id: user.id, email: user.email ?? '' }).select();

      await fetchItems();
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_OUT') router.push('/login');
      if (evt === 'SIGNED_IN' && session?.user) setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // 依據 items / 搜尋字 / 類別 進行前端篩選（標題關鍵字）
  useEffect(() => {
    let list = [...items];

    // 1) 只搜尋「標題」包含關鍵字
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(it => (it.title ?? '').toLowerCase().includes(q));
    }

    // 2) 類別篩選
    if (selectedCategory) {
      list = list.filter(it => it.category?.includes(selectedCategory));
    }

    setFilteredItems(list);
  }, [items, searchQuery, selectedCategory]);

  async function fetchItems() {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id,user_id,type,title,raw_content,url,summary,summary_tip,category,created_at,prompt_assets(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as any[];
      setItems(rows as ItemWithAssets[]);

      // 產生所有類別清單
      const cats = new Set<string>();
      rows.forEach((r) => {
        (r.category ?? []).forEach((c: string) => cats.add(c));
      });
      setCategories(Array.from(cats));
    } catch (e) {
      console.error(e);
      toast.error('載入項目失敗');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  // 30 字「提示」— 強制重算，伺服器會同時讀圖片 URL
  async function makeTip(itemId: number) {
    try {
      setSummarizingId(itemId);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, force: true }), // ★ 重要：force 重算
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '提示失敗');
      }
      await fetchItems(); // 取回最新 summary_tip
      toast.success('已產生最新提示');
    } catch (e: any) {
      toast.error(e?.message ?? '提示失敗');
    } finally {
      setSummarizingId(null);
    }
  }

  // 取內容前 N 個字（中文/英文都可），避免 null
  function snippet(text: string | null, n = 20) {
    const t = (text ?? '').trim();
    if (!t) return '';
    return t.length <= n ? t : `${t.slice(0, n)}…`;
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
                placeholder="只搜尋標題中的關鍵字…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && /*即時靠前端過濾*/ null}
                className="pl-10"
              />
            </div>
            <Button onClick={() => {/* 目前即時過濾，不需實作 */}}>
              搜尋
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
            {filteredItems.map((item) => (
              <Link key={item.id} href={`/items/${item.id}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    {/* 首張圖片縮圖 */}
                    {item.prompt_assets?.[0]?.image_url && (
                      <div className="mb-3">
                        <img
                          src={item.prompt_assets[0].image_url as string}
                          alt="預覽圖"
                          className="w-full h-40 object-cover rounded-md"
                          loading="lazy"
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

                      {/* AI 提示按鈕（阻止 Link 跳頁） */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          makeTip(item.id);
                        }}
                        disabled={summarizingId === item.id}
                        title={item.summary_tip || '按一下產生（或重算）提示'}
                      >
                        {summarizingId === item.id ? '產生中…' : '提示'}
                      </Button>
                    </div>

                    <CardTitle className="text-lg leading-tight mt-2" title={item.title ?? ''}>
                      {item.title || '（無標題）'}
                    </CardTitle>

                    {/* 顯示內容前 20 字 */}
                    {(item.raw_content ?? '').trim() && (
                      <CardDescription className="text-sm" title={item.raw_content ?? ''}>
                        {snippet(item.raw_content, 20)}
                      </CardDescription>
                    )}

                    {/* 30 字內 AI 提示（摘要） */}
                    {(item.summary_tip ?? '').trim() && (
                      <CardDescription
                        className="text-sm text-blue-700"
                        title={item.summary_tip ?? ''}
                      >
                        {item.summary_tip}
                      </CardDescription>
                    )}

                    {/* 若也有較長的 AI 摘要，可節錄顯示 */}
                    {(item.summary ?? '').trim() && (
                      <CardDescription className="text-sm" title={item.summary ?? ''}>
                        {(item.summary as string).length > 100
                          ? `${(item.summary as string).slice(0, 100)}…`
                          : (item.summary as string)}
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
            ))}
          </div>
        )}
      </div>

      {/* 新增項目 Modal */}
      <AddItemModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onItemAdded={fetchItems}
      />
    </div>
  );
}
