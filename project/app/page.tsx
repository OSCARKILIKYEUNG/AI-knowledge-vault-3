'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brain } from 'lucide-react';

// 強制動態，避免被靜態化後 router 失效
export const dynamic = 'force-dynamic';

export default function Home() {
  const router = useRouter();
  const [debug, setDebug] = useState('[Home] init');
  const [sessionJson, setSessionJson] = useState('(empty)');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    (async () => {
      try {
        setDebug('[Home] supabase.auth.getSession() ...');
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setDebug(`[Home] getSession error: ${error.message} -> /login`);
          router.replace('/login');
          setTimeout(() => { window.location.href = '/login'; }, 300);
          return;
        }

        setSessionJson(JSON.stringify(data ?? {}, null, 2));

        if (data?.session?.user) {
          setDebug(`[Home] signed in as ${data.session.user.email} -> /dashboard`);
          router.replace('/dashboard');
          setTimeout(() => { window.location.href = '/dashboard'; }, 300);
        } else {
          setDebug('[Home] no session -> /login');
          router.replace('/login');
          setTimeout(() => { window.location.href = '/login'; }, 300);
        }
      } catch (e: any) {
        setDebug(`[Home] exception: ${e?.message ?? String(e)} -> /login`);
        router.replace('/login');
        setTimeout(() => { window.location.href = '/login'; }, 300);
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
        <p className="text-gray-800 text-xl font-semibold mb-2">載入中…（偵錯首頁）</p>

        <div className="mt-3 p-4 rounded border bg-white text-left">
          <div className="text-sm font-mono leading-relaxed whitespace-pre-wrap">
            <strong>狀態：</strong>{debug}
          </div>
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">getSession() 回傳：</div>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">{sessionJson}</pre>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <a className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm" href="/login">前往 /login</a>
            <a className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm" href="/dashboard">前往 /dashboard</a>
          </div>
        </div>
      </div>
    </div>
  );
}
