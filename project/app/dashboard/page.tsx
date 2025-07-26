'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export default function DashboardMinimal() {
  const router = useRouter();
  const [email, setEmail] = useState('(未登入)');
  const [debug, setDebug] = useState('[Dashboard] init');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setDebug('[Dashboard] supabase.auth.getUser() ...');
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error) {
        setDebug(`[Dashboard] getUser error: ${error.message} -> /login`);
        router.replace('/login');
        setTimeout(() => { window.location.href = '/login'; }, 300);
        return;
      }
      if (!data?.user) {
        setDebug('[Dashboard] no user -> /login');
        router.replace('/login');
        setTimeout(() => { window.location.href = '/login'; }, 300);
        return;
      }

      setEmail(data.user.email || '(未知 email)');
      setDebug('[Dashboard] user ok');
      setReady(true);
    })();

    // 監聽登入狀態變更（可選）
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_OUT') {
        router.replace('/login');
        setTimeout(() => { window.location.href = '/login'; }, 300);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    setTimeout(() => { window.location.href = '/login'; }, 300);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Dashboard 初始化中…</p>
          <p className="text-xs text-gray-400 mt-2">{debug}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold">Dashboard（極簡測試版）</h1>
        <p>已登入：<span className="font-mono">{email}</span></p>
        <button
          onClick={signOut}
          className="px-3 py-2 rounded border bg-gray-50 hover:bg-gray-100 text-sm"
        >
          登出
        </button>
        <p className="text-xs text-gray-400 mt-2">{debug}</p>
      </div>
    </div>
  );
}
