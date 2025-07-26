'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { Database } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddItemModal } from '@/components/AddItemModal';

import {
  Brain,
  Search as SearchIcon,
  Plus,
  LogOut,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';

type ItemRow = Database['public']['Tables']['items']['Row'];
type ItemWithAssets = ItemRow & {
  prompt_assets: { image_url: string | null }[] | null;
};

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const router = useRouter();

  // --- Auth / session ---
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // --- UI state ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // --- Data ---
  const [items, setItems] = useState<ItemWithAssets[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // 1) 檢查登入狀態
  useEffect(() => {
    let sub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.user) {
        setSessionChecked(true);
        router.replace('/login');
        return;
      }

      const u = data.session.user;
      userIdRef.current = u.id;
      setUserEmail(u.email ?? null);
      setSessionChecked(true);

      // 第一次載入資料
      fetchItems();

      // 監聽登入狀態變化
      sub = supabase.auth.onAuthStateChange((_e, s) => {
        const uu = s?.user ?? null;
        userIdRef.current = uu?.id ?? null;
        setUserEmail(uu?.email ?? null);
        if (!uu) router.replace('/login');
      }) as any;
    };

    check();
    return () => sub?.data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 讀取 items（包含首張圖片）
  const fetchItems = async () => {
    try {
      setLoading(true);
      const uid = userIdRef.current;
      if (!uid) return;

      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data as ItemWithAssets[]) ?? []);
    } catch (e) {
      console.error('載入項目失敗', e);
    } finally {
      setLoading(false);
    }
  };

  // 3) 由 items 推導「全部分類清單」
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      (it.category ?? []).forEach((c) => set.add(c));
    }
    return Array.from(set).sort();
  }, [items]);

  // 4) 前端搜尋/篩選
  const filtered = useMemo(() => {
    let list = items;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((it) => {
        const t = (it.title ?? '').toLowerCase();
        const rc = (it.raw_content ?? '').toLowerCase();
        const sm = (it.summary ?? '').toLowerCase();
        return t.includes(q) || rc.includes(q) || sm.includes(q);
      });
    }

    if (selectedCategory) {
      list = list.filter((it) => (it.category ?? []).includes(selectedCategory));
    }

    return list;
  }, [items, searchQuery, selectedCategory]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Loading 畫面（僅在尚未確認 session 或資料載入時）
  if (!sessionChecked || loading) {
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
            <Brain className="h-7 w-7 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">AI Knowledge Vault</h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center text-sm text-gray-600">
              {userEmail}
            </div>
            <Avatar>
              <AvatarFallback>
                {(userEmail?.[0] ?? 'U').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              登出
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Search + Actions */}
        <div className="mb-8 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜尋標題、內容或摘要…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              新增項目
            </Button>
          </div>

          {/* Category Filter */}
          {allCategories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={selectedCategory === '' ? 'default' : 'outline'}
                onClick={() => setSelectedCategory('')}
              >
                全部
              </Button>
              {allCategories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={selectedCategory === c ? 'default' : 'outline'}
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
          <div className="text-center py-16">
            <Brain className="h-14 w-14 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {items.length === 0 ? '開始建立您的知識庫' : '找不到符合條件的項目'}
            </h3>
            <p className="text-gray-600 mb-4">
              {items.length === 0
                ? '新增您的第一個項目來開始使用 AI Knowledge Vault'
                : '試試其他關鍵字或更改分類'}
            </p>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              新增項目
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const thumb = item.prompt_assets?.[0]?.image_url ?? null;
              return (
                <Link key={item.id} href={`/items/${item.id}`}>
                  <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer overflow-hidden">
                    {/* Thumbnail */}
                    {thumb && (
                      <div className="w-full h-40 bg-gray-100">
                        {/* 用 <img> 避免 Next/Image 遠端網域限制 */}
                        <img
                          src={thumb}
                          alt="預覽圖"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <CardHeader>
                      <div className="flex items-start justify-between mb-1">
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
                      </div>

                      <CardTitle className="text-lg leading-tight line-clamp-2">
                        {item.title ?? '（無標題）'}
                      </CardTitle>

                      {item.summary && (
                        <CardDescription className="text-sm line-clamp-3">
                          {item.summary}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="pb-4">
                      {(item.category ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(item.category ?? []).slice(0, 3).map((cat) => (
                            <Badge key={cat} variant="outline" className="text-xs">
                              {cat}
                            </Badge>
                          ))}
                          {(item.category ?? []).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(item.category ?? []).length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
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
