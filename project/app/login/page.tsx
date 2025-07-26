'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>('');

  // 已登入就直接去 dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace('/dashboard');
    })();
  }, [router]);

  const resetMsg = () => setMsg('');

  const handleSignIn = async () => {
    setLoading(true);
    resetMsg();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // 可選：建立/更新 users 表（也可在 /dashboard 再 upsert）
      const u = data.user;
      if (u) {
        await supabase.from('users').upsert({ id: u.id, email: u.email }).select();
      }

      setMsg('登入成功，前往儀表板…');
      router.replace('/dashboard');
    } catch (e: any) {
      setMsg(`登入失敗：${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    resetMsg();
    try {
      if (!email || !password) {
        setMsg('請輸入 Email 與密碼'); 
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setMsg('密碼至少 6 碼');
        setLoading(false);
        return;
      }
      if (password !== password2) {
        setMsg('兩次輸入的密碼不一致');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // 若你在 Supabase 啟用信箱驗證，註冊後會寄驗證信
        // options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;

      // 根據 Supabase 設定，可能：
      // 1) 需要先去信箱驗證（沒有 session）
      // 2) 直接建立 session（不需要驗證）
      if (data?.user) {
        // 可選：先 upsert users
        await supabase.from('users').upsert({ id: data.user.id, email: data.user.email }).select();
      }

      // 有沒有 session？
      const { data: s } = await supabase.auth.getSession();
      if (s?.session) {
        setMsg('註冊成功，已登入，前往儀表板…');
        router.replace('/dashboard');
      } else {
        setMsg('註冊成功。若已開啟信箱驗證，請到信箱點擊驗證後再登入。');
      }
    } catch (e: any) {
      setMsg(`註冊失敗：${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') await handleSignIn();
    else await handleSignUp();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 bg-white border rounded p-6">
        <h1 className="text-xl font-semibold text-center">AI Knowledge Vault</h1>

        {/* 切換 Sign in / Sign up */}
        <div className="flex gap-2 justify-center">
          <Button
            type="button"
            variant={mode === 'signin' ? 'default' : 'outline'}
            onClick={() => setMode('signin')}
          >
            登入
          </Button>
          <Button
            type="button"
            variant={mode === 'signup' ? 'default' : 'outline'}
            onClick={() => setMode('signup')}
          >
            註冊
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={resetMsg}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm">密碼</label>
            <Input
              type="password"
              placeholder="至少 6 碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={resetMsg}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm">再次輸入密碼</label>
              <Input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onFocus={resetMsg}
                required
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (mode === 'signin' ? '登入中…' : '註冊中…') : (mode === 'signin' ? '登入' : '註冊')}
          </Button>

          {msg && (
            <p className={`text-sm ${msg.startsWith('註冊成功') || msg.startsWith('登入成功') ? 'text-green-600' : 'text-red-600'}`}>
              {msg}
            </p>
          )}
        </form>

        <p className="text-xs text-gray-500">
          提示：若你在 Supabase 的 Authentication 設定啟用了「Email confirmations」，註冊後需到信箱點擊驗證才可登入。
          如想註冊後直接登入，請在 Supabase 後台關閉該選項。
        </p>
      </div>
    </div>
  );
}
