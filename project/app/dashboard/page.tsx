'use client';

import { useState, useEffect } from 'react';
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
  Wand2,
  Pencil,
} from 'lucide-react';
import { formatDate, truncateText } from '@/lib/utils';
import { toast } from 'sonner';
import { searchItems } from '@/lib/api';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ItemRow = Database['public']['Tables']['items']['Row'];
type ItemWithAssets = ItemRow & {
  prompt_assets?: { image_url: string | null }[];
};

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

  // AI 提示（保存完整文字；UI 顯示截斷，hover 顯示完整）
  const [aiSummaries, setAiSummaries] = useState<Record<number, string>>({});
  const [summarizingId, setSummarizingId] = useState<number | null>(null);

  // 編輯對話框
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ItemWithAssets | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editRaw, setEditRaw] = useState('');
  const [editCats, setEditCats] = useState('');

  // ===== Auth =====
  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) setUser(session.user);
        else if (event === 'SIGNED_OUT') router.push('/login');
      }
    );
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
    await supabase.from('users').upsert({ id: user.id, email: user.email! }).select();
  };

  // ===== Data =====
  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data as ItemWithAssets[]) || [];
      setItems(list);

      const all = list.flatMap((it) => it.category || []);
      setCategories(Array.from(new Set(all)));
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
      filtered = filtered.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.raw_content || '').toLowerCase().includes(q) ||
          (item.summary || '').toLowerCase().includes(q)
      );
    }
    if (selectedCategory) {
      filtered = filtered.filter((item) =>
        item.category?.includes(selectedCategory)
      );
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
      const filtered = items.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.raw_content || '').toLowerCase().includes(q) ||
          (item.summary || '').toLowerCase().includes(q)
      );
      setFilteredItems(filtered);
    }
  };

  // ===== AI 提示（帶圖片） =====
  const handleSummarize = async (item: ItemWithAssets, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const title = item.title || '';
    const desc = item.summary || item.raw_content || item.url || '';
    const imageUrls = (item.prompt_assets || [])
      .map((a) => a.image_url)
      .filter(Boolean) as string[];

    setSummarizingId(item.id as number);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: desc, images: imageUrls }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const full: string = (data.summary || '').trim();
      setAiSummaries((prev) => ({ ...prev, [item.id as number]: full }));
      toast.success('已產生提示');
    } catch (err) {
      console.error(err);
      toast.error('AI 提示失敗');
    } finally {
      setSummarizingId(null);
    }
  };

  // ===== 編輯 =====
  const openEdit = (item: ItemWithAssets, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditing(item);
    setEditTitle(item.title || '');
    setEditUrl(item.url || '');
    setEditRaw(item.raw_content || '');
    setEditCats((item.category || []).join(','));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const cats = editCats
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('items')
        .update({
          title: editTitle || null,
          url: editing.type === 'link' ? editUrl || null : null,
          raw_content: editRaw || null,
          category: cats.length ? cats : null,
        })
        .eq('id', editing.id);

      if (error) throw error;

      toast.success('已更新');
      setEditOpen(false);
      await fetchItems();
    } catch (e) {
      console.error(e);
      toast.error('更新失敗');
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
            <h1 className="text-2xl font-bold text-gray-900">
              AI Knowledge Vault
            </h1>
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
              {items.length === 0
                ? '新增您的第一個項目來開始使用 AI Knowledge Vault'
                : '嘗試不同的搜尋關鍵字或篩選條件'}
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
              const fullBrief = aiSummaries[item.id as number] || '';
              const shortBrief = truncateText(fullBrief, 30);

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

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleSummarize(item, e)}
                            disabled={summarizingId === item.id}
                          >
                            <Wand2 className="h-4 w-4 mr-1" />
                            {summarizingId === item.id ? '產生中…' : '提示'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => openEdit(item, e)}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            編輯
                          </Button>
                        </div>
                      </div>

                      {/* AI 30字摘要（hover 顯示完整） */}
                      {fullBrief && (
                        <CardDescription
                          className="mt-2 text-[13px] text-blue-700"
                          title={fullBrief}
                        >
                          {shortBrief}
                        </CardDescription>
                      )}

                      <CardTitle className="text-lg leading-tight mt-1" title={item.title || ''}>
                        {truncateText(item.title || '', 60)}
                      </CardTitle>

                      {item.summary && (
                        <CardDescription className="text-sm" title={item.summary || ''}>
                          {truncateText(item.summary || '', 100)}
                        </CardDescription>
                      )}
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-3">
                        {item.category && item.category.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {/* 顯示全部分類 */}
                            {item.category.map((cat) => (
                              <Badge key={cat} variant="outline" className="text-xs">
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          {formatDate(item.created_at)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增項目 */}
      <AddItemModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onItemAdded={fetchItems}
      />

      {/* 編輯項目（簡易版） */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯項目</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>標題</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>

            {editing?.type === 'link' && (
              <div>
                <Label>網址</Label>
                <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
              </div>
            )}

            <div>
              <Label>{editing?.type === 'prompt' ? '內容' : '備註'}</Label>
              <Textarea
                rows={5}
                value={editRaw}
                onChange={(e) => setEditRaw(e.target.value)}
              />
            </div>

            <div>
              <Label>分類（逗號分隔）</Label>
              <Input
                value={editCats}
                onChange={(e) => setEditCats(e.target.value)}
                placeholder="例如：AI, 圖像, 策略"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button onClick={saveEdit}>儲存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
