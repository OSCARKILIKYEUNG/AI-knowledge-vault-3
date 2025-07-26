'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { Brain } from 'lucide-react';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 已登入就不要再停留在 login
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) router.replace('/dashboard');
    });
  }, [router]);

  const handleSignin = async () => {
    if (!email || !password) {
      toast.error('請輸入 Email 與密碼');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const u = data.user ?? data.session?.user;
      if (u) {
        // 確保 users 表有資料（RLS 依賴）
        await supabase.from('users').upsert({ id: u.id, email: u.email! }).select();
      }

      toast.success('登入成功');
      router.replace('/dashboard');
    } catch (e: any) {
      toast.error(e?.message || '登入失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      toast.error('請輸入 Email 與密碼');
      return;
    }
    // Supabase 預設密碼規則：至少 6 碼（可在 Auth 設定調整）
    if (password.length < 6) {
      toast.error('密碼至少 6 碼');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // 兩種情境：
      // A) 若 Supabase 啟用 Confirm email：此處不會直接登入，要用戶去收信點連結
      // B) 若關閉 Confirm email：signUp 後通常會有 session，可直接 upsert + 導向
      if (data.user && !data.session) {
        toast.success('註冊成功，請到 Email 點擊確認連結後再登入。');
        setMode('signin');
      } else if (data.session?.user) {
        await supabase.from('users').upsert({
          id: data.session.user.id,
          email: data.session.user.email!,
        }).select();
        toast.success('註冊成功，已登入');
        router.replace('/dashboard');
      } else {
        toast.message('註冊完成，請嘗試登入');
        setMode('signin');
      }
    } catch (e: any) {
      toast.error(e?.message || '註冊失敗');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center mb-4">
          <Brain className="h-8 w-8 text-blue-600 mr-2" />
          <h1 className="text-xl font-semibold">AI Knowledge Vault</h1>
        </div>

        <div className="flex mb-6 rounded border p-1">
          <button
            className={`flex-1 py-2 rounded ${mode === 'signin' ? 'bg-blue-600 text-white' : 'bg-transparent'}`}
            onClick={() => setMode('signin')}
          >
            登入
          </button>
          <button
            className={`flex-1 py-2 rounded ${mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-transparent'}`}
            onClick={() => setMode('signup')}
          >
            註冊
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              type="password"
              placeholder="至少 6 碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'signin' ? (
            <Button className="w-full" disabled={isLoading} onClick={handleSignin}>
              {isLoading ? '登入中...' : '登入'}
            </Button>
          ) : (
            <Button className="w-full" disabled={isLoading} onClick={handleSignup}>
              {isLoading ? '註冊中...' : '建立帳號'}
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          登入後即表示你同意本服務的條款。
        </p>

        <div className="text-center mt-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            回首頁
          </Link>
        </div>
      </div>
    </div>
  );
}
