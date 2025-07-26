'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 已登入就直接去 dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        router.replace('/dashboard');
      }
    })();
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // 有些專案會要求 email 驗證，這裡統一導到 dashboard（Supabase 設定若需驗證再調整流程）
        if (data?.user) router.replace('/dashboard');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) router.replace('/dashboard');
      }
    } catch (err: any) {
      setMsg(err?.message ?? '發生錯誤，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white shadow rounded p-6">
        <h1 className="text-xl font-semibold mb-4">
          {mode === 'signin' ? '登入' : '註冊'}
        </h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm block mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded px-3 py-2"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="text-sm block mb-1">Password</label>
            <input
              type="password"
              className="w-full border rounded px-3 py-2"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 碼"
              required
            />
          </div>

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded py-2"
          >
            {busy ? '處理中…' : (mode === 'signin' ? '登入' : '註冊')}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'signin' ? (
            <button className="underline" onClick={() => setMode('signup')}>
              還沒有帳號？改為註冊
            </button>
          ) : (
            <button className="underline" onClick={() => setMode('signin')}>
              已有帳號？改為登入
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
