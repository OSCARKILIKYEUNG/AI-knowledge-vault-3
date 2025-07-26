'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AddItemModal } from '@/components/AddItemModal';
import { SearchIcon, Plus, LogOut, Brain, FileText, Link as LinkIcon } from 'lucide-react';
import { formatDate, truncateText } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { searchItems } from '@/lib/api';

type ItemRow = Database['public']['Tables']['items']['Row'];
type PromptAsset = { image_url: string | null };
type ItemWithAssets = ItemRow & { prompt_assets?: PromptAsset[] };

export default function DashboardPage() {
  const [items, setItems] = useState<ItemWithAssets[]>([]);
  const [filteredItems, setFilteredItems] = useState<ItemWithAssets[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        router.push('/login');
        setLoading(false);
        return;
      }
      setUser(user);
      await supabase.from('users').upsert({ id: user.id, email: user.email! }).select();
    })()
    .catch(() => {})
    .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        router.push('/login');
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchItems();
    }
  }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(data || []);
      const cats = data?.flatMap(item => item.category || []) || [];
      setCategories(Array.from(new Set(cats)));
    } catch {
      toast.error('載入項目失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const filtered = items.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.raw_content || '').toLowerCase().includes(q) ||
      (item.summary || '').toLowerCase().includes(q)
    );
    setFilteredItems(filtered);
  }, [items, searchQuery]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await searchItems(searchQuery, user.id);
      setFilteredItems(results);
    } catch {
      setFilteredItems(items);
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
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant={selectedCategory === '' ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory('')}>全部</Button>
              {categories.map(cat => (
                <Button key={cat} variant={selectedCategory === cat ? 'default' : 'outline'} size="sm" onClick={() => setSelectedCategory(cat)}>
                  {cat}
                </Button>
              ))}
            </div>
          )}
        </div>

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
            {filteredItems.map(item => (
              <Link key={item.id} href={`/items/${item.id}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    {item.prompt_assets?.[0]?.image_url && (
                      <div className="mb-3">
                        <img
                          src={item.prompt_assets[0].image_url!}
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
                    </div>
                    <CardTitle className="text-lg leading-tight">{truncateText(item.title || '', 60)}</CardTitle>
                    {item.summary && <CardDescription className="text-sm">{truncateText(item.summary || '', 100)}</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {item.category && item.category.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.category.slice(0, 3).map(cat => (
                            <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                          ))}
                          {item.category.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{item.category.length - 3}</Badge>
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
