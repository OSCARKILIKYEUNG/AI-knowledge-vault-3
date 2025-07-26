'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Brain } from 'lucide-react';

// 強制動態，避免被完全靜態化
export const dynamic = 'force-dynamic';

type Item = {
  id: number;
  title: string | null;
  raw_content: string | null;
  summary: string | null;
  url: string | null;
  type: 'prompt' | 'link';
  category: string[] | null;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [debug, setDebug] = useState<string>('[Dashboard] init');
  const [userEmail, setUserEmail] = useState<string>('');
  const [itemsCount, setItemsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchItems = async (uid: string) => {
    setDebug('[Dashboard] fetch items...');
    const { data, error } = await supabase
      .from('items')
      .select('id') // 只抓 id 減少流量
      .order('created_at', { ascending: false });

    if (error) {
      setDebug(`[Dashboard] fetch items error: ${error.message}`);
      setItemsCount(0);
      return;
    }
    setItemsCount(data?.length || 0);
    setDebug(`[Dashboard] items: ${data?.length || 0}`);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setDebug('[Dashboard] getSession...');
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setDebug('[Dashboard] getSession error -> /login');
          router.replace('/login');
          return;
        }
        const user = data?.session?.user;
        if (!user) {
          setDebug('[Dashboard] no user -> /login');
          router.replace('/login');
          return;
        }
        setUserEmail(user.email || '');
        setDebug(`[Dashboard] user: ${user.email}`);
        await fetchItems(user.id);
      } catch (e) {
        setDebug('[Dashboard] exception -> /login');
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="p-4 bg-white rounded border">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600" />
            <div className="font-semibold">Debug 面板（臨時）</div>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            <div>狀態：{debug}</div>
            <div>使用者：{userEmail || '（未登入）'}</div>
            <div>Items 計數：{itemsCount}</div>
            <div>Loading：{String(loading)}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const { data } = await supabase.auth.getSession();
                if (data?.session?.user?.id) await fetchItems(data.session.user.id);
              }}
            >
              重新抓取 Items
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}
            >
              登出
            </Button>
          </div>
        </div>

        {/* 下面可以是你原本的 Dashboard UI；先保留最小可視化偵錯 */}
        <div className="p-4 bg-white rounded border">
          <div className="text-sm text-gray-500">
            這裡是暫時的 Debug 版 Dashboard。確認能顯示使用者與 items 計數後，我再幫你接回完整 UI。
          </div>
        </div>
      </div>
    </div>
  );
}
