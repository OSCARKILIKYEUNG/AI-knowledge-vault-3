'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brain } from 'lucide-react';

// 強制動態，避免被完全靜態化
export const dynamic = 'force-dynamic';

export default function Home() {
  const router = useRouter();
  const [debug, setDebug] = useState<string>('[Home] init');

  useEffect(() => {
    const run = async () => {
      try {
        setDebug('[Home] getSession...');
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setDebug('[Home] getSession error -> /login');
          router.replace('/login');
          return;
        }

        if (data?.session?.user) {
          setDebug(`[Home] signed in as ${data.session.user.email} -> /dashboard`);
          router.replace('/dashboard');
        } else {
          setDebug('[Home] no session -> /login');
          router.replace('/login');
        }
      } catch (e) {
        setDebug('[Home] exception -> /login');
        router.replace('/login');
      }
    };
    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
        <p className="text-gray-600">載入中...</p>
        {/* 直接把狀態印在畫面上 */}
        <p className="mt-2 text-xs text-gray-400">{debug}</p>
      </div>
    </div>
  );
}
