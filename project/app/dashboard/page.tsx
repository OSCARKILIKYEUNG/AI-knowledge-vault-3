'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brain } from 'lucide-react';

// 強制非靜態，避免被 Next.js 產成純靜態頁
export const dynamic = 'force-dynamic';

export default function Home() {
  const router = useRouter();
  const [debug, setDebug] = useState<string>('[Home] init');
  const [sessionJson, setSessionJson] = useState<string>('(empty)');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    const run = async () => {
      try {
        setDebug('[Home] calling supabase.auth.getSession() ...');
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setDebug(`[Home] getSession ERROR: ${error.message} -> go /login`);
          router.replace('/login');
          return;
        }

        setSessionJson(JSON.stringify(data || {}, null, 2));

        if (data?.session?.user) {
          setDebug(`[Home] signed in as ${data.session.user.email} -> go /dashboard`);
          router.replace('/dashboard');
        } else {
          setDebug('[Home] no session -> go /login');
          router.replace('/login');
        }
      } catch (e: any) {
        setDebug(`[Home] exception: ${e?.message ?? String(e)} -> go /login`);
        router.replace('/login');
      }
    };

    run();

    // 若 6 秒仍未跳轉，顯示手動導向提示
    const t = setTimeout(() => {
      setDebug((d) => `${d}  |  (Timeout 6s: still here)`);
    }, 6000);

    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
        <p className="text-gray-800 text-xl font-semibold mb-2">載入中…（偵錯版首頁）</p>

        {/* -- 關鍵：把目前狀態直接印在畫面上 -- */}
        <div className="mt-3 p-4 rounded border bg-white text-left">
          <div className="text-sm font-mono leading-relaxed whitespace-pre-wrap">
            <strong>狀態：</strong>{debug}
          </div>

          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">getSession() 原始回傳：</div>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
              {sessionJson}
            </pre>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
              onClick={() => router.replace('/login')}
            >
              直接前往 /login
            </button>
            <button
              className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
              onClick={() => router.replace('/dashboard')}
            >
              直接前往 /dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
