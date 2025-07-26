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
type ItemWithAssets = ItemRow & { prompt_assets?: { image_url: string | null }[] };

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); setLoading(false); return; }
      setUser(user);
      await supabase.from('users').upsert({ id: user.id, email: user.email! }).select();
    })().catch(() => {}).finally(() => {
      // 如果 checkUser 卡住也要跳開 loading 嘛
      setLoading(prev => prev && false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) setUser(session.user);
      if (event === 'SIGNED_OUT') router.push('/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchItems();
  }, [user]);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, prompt_assets(image_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(data || []);
      const allCategories = data?.flatMap(item => item.category || []) || [];
      setCategories(Array.from(new Set(allCategories)));
    } catch {
      toast.error('載入項目失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (items) {
      const q = searchQuery.toLowerCase();
      const filtered = items.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.raw_content || '').toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q)
      );
      setFilteredItems(filtered);
    }
  }, [items, searchQuery]);

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

  // 以下略... (同你前面 code 渲染 list 區塊)
}
