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

import {
  Brain,
  FileText,
  Link as LinkIcon,
  LogOut,
  Plus,
  SearchIcon,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

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
  const [viewItems, setViewItems] = useState<ItemWithAssets[]>([]); // 畫面上顯示的結果（按鈕時才更新）
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [aiSearching, setAiSearching] = useState(false);

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
      // 確保 users 表有記錄
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

  async function fetchItems() {
    try {
      const { data, error } = await supabase
        .from('items')
        .select(
          'id,user_id,type,title,raw_content,url,summary,summary_tip,category,created_at,prompt_assets(image_url)'
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as ItemWithAssets[];
      setItems(rows);
      setViewItems(rows); // 預設顯示全部

      // 產出分類
      const set = new Set<string>();
      rows.forEach((r) => (r.category ?? []).forEach((c) => set.add(c)));
      setCategories(Array.from(set));
    } catch (e) {
      console.error(e);
      toast.error('載入項目失敗');
    }
  }

  function applyCategoryFilter(list: ItemWithAssets[]) {
    if (!selectedCategory) return list;
    return list.filter((it) => it.category?.includes(selectedCategory));
  }

  /** 一般搜尋（主題）— 僅比對標題；需按下「搜尋主題」才觸發 */
  function handleKeywordSearch() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setViewItems(applyCategoryFilter(items));
      return;
    }
    const base = items.filter((it) => (it.title ?? '').toLowerCase().includes(q));
    setViewItems(applyCategoryFilter(base));
  }

  /** 內容搜尋 — 比對 raw_content / summary / summary_tip */
  function handleSearchContent() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setViewItems(applyCategoryFilter(items));
      return;
    }
    const base = items.filter((it) =>
      (it.raw_content ?? '').toLowerCase().includes(q) ||
      (it.summary ?? '').toLowerCase().includes(q) ||
      (it.summary_tip ?? '').toLowerCase().includes(q)
    );
    setViewItems(applyCategoryFilter(base));
  }

  /** AI 摘要搜尋 — 呼叫 /api/ai-search（僅用 summary_tip 比對） */
  async function runAISearch() {
    const q = searchQuery.trim();
    if (!q) {
      toast.error('請先輸入關鍵字');
      return;
    }
    if (!user?.id) {
      toast.error('尚未登入');
      return;
    }
    try {
      setAiSearching(true);
      const res = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, userId: user.id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'AI 摘要搜尋失敗');
        setViewItems([]);
        return;
      }
      const ids: number[] = Array.isArray(json?.ids) ? json.ids : [];
      const map = new Map<number, ItemWithAssets>();
      items.forEach((it) => map.set(it.id, it));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as ItemWithAssets[];
      setViewItems(applyCategoryFilter(ordered));
      toast.success(`AI 摘要搜尋完成，共 ${ordered.length} 筆`);
    } catch (e) {
      console.error(e);
      toast.error('AI 摘要搜尋發生錯誤');
    } finally {
      setAiSearching(false);
    }
  }

  /** 產生 / 重算 30 字提示（納入最新圖片與連結） */
  async function makeTip(itemId: number) {
    try {
      setSummarizingId(itemId);
      const res = await fetch('/api/ai-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '提示失敗');
      await fetchItems();
      toast.success('已產生最新提示');
    } catch (e: any) {
      toast.error(e?.message ?? '提示失敗');
    } finally {
      setSummarizingId(null);
    }
  }

  function oneLine(text: string | null, max = 120) {
    const t = (text ?? '').trim();
    if (!t) return '';
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
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
        {/* Search & Actions：同一行（小螢幕可左右滑動） */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-1 -mx-4 px-4">
            {/* 搜尋輸入框：固定最小寬，避免被擠到看不到 */}
            <div className="relative flex-none min-w-[260px] sm:min-w-[360px]">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="輸入關鍵字…（按下按鈕才會搜尋）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleKeywordSearch(); }}
                className="pl-10 w-full"
              />
            </div>

            {/* 按鈕群：不換行、保持一行顯示；不足時可橫向捲動 */}
            <Button className="flex-none whitespace-nowrap" onClick={handleKeywordSearch} title="只在標題中比對關鍵字">
              <SearchIcon className="h-4 w-4 mr-1" />
              搜尋主題
            </Button>

            <Button
              className="bg-black text-white hover:bg-black/90"
              variant="secondary"
              onClick={handleSearchContent}
              title="只在內容中比對關鍵字"
            >
              <SearchIcon className="h-4 w-4 mr-1" />
              搜尋內容
            </Button>

            <Button
              className="flex-none whitespace-nowrap"
              onClick={runAISearch}
              disabled={aiSearching}
              title="只用 AI 摘要（summary_tip）做比對"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {aiSearching ? 'AI 搜尋中…' : 'AI 摘要搜尋'}
            </Button>

            <Button className="flex-none whitespace-nowrap" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新增項目
            </Button>
          </div>

          {/* 分類篩選 */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === '' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedCategory('');
                  setViewItems(applyCategoryFilter(items));
                }}
              >
                全部
              </Button>
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedCategory(category);
                    setViewItems((prev) => applyCategoryFilter(prev.length ? prev : items));
                  }}
                >
                  {category}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Items Grid */}
        {viewItems.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {items.length === 0 ? '開始建立您的知識庫' : '找不到相關項目'}
            </h3>
            <p className="text-gray-600 mb-4">
              {items.length === 0
                ? '新增您的第一個項目來開始使用 AI Knowledge Vault'
                : '請嘗試不同關鍵字，或使用 AI 摘要搜尋'}
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
            {viewItems.map((item) => (
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
                          {item.type === 'prompt' ? 'Prompt' : '連結'}
                        </Badge>
                      </div>

                      {/* 產生/重算 提示（阻止 Link 跳頁） */}
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

                    {/* 內容前一行（單行省略） */}
                    {(item.raw_content ?? '').trim() && (
                      <CardDescription
                        className="text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                        title={item.raw_content ?? ''}
                      >
                        {oneLine(item.raw_content, 140)}
                      </CardDescription>
                    )}

                    {/* 30 字內 AI 提示（單行顯示） */}
                    {(item.summary_tip ?? '').trim() && (
                      <CardDescription
                        className="text-sm text-blue-700 overflow-hidden text-ellipsis whitespace-nowrap"
                        title={item.summary_tip ?? ''}
                      >
                        {item.summary_tip}
                      </CardDescription>
                    )}

                    {/* 長摘要（若有）— 單行節錄 */}
                    {(item.summary ?? '').trim() && (
                      <CardDescription
                        className="text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                        title={item.summary ?? ''}
                      >
                        {oneLine(item.summary, 140)}
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

      <AddItemModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onItemAdded={fetchItems}
      />
    </div>
  );
}
