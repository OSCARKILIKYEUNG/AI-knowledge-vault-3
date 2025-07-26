'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        // 若已登入，直接去 Dashboard（不阻塞畫面）
        if (data?.user) router.replace('/dashboard');
      } catch {
        // 就算失敗也不要卡住首頁
      }
    })();

    return () => { mounted = false; };
  }, [router]);

  // 立即顯示的簡單首頁（不會出現「載入中」）
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6 bg-white border rounded p-8">
        <h1 className="text-2xl font-bold">AI Knowledge Vault</h1>
        <p className="text-gray-600">歡迎！請先登入或註冊使用。</p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded px-4 py-2 bg-black text-white"
          >
            登入 / 註冊
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded px-4 py-2 border"
          >
            前往儀表板
          </Link>
        </div>

        <p className="text-xs text-gray-400">
          已登入的使用者會自動跳轉到 Dashboard；未登入可點上方按鈕前往。
        </p>
      </div>
    </main>
  );
}
