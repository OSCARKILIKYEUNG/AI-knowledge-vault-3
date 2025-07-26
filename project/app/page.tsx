'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Brain,
  LogIn,
  ArrowRight,
  Search,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';

// 不做自動導向；只是讀取 session 來決定按鈕文案/跳轉目的
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    const run = async () => {
      // 讀取當前 session
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user ?? null;
      setIsSignedIn(!!user);
      setEmail(user?.email ?? null);
      setChecking(false);

      // 監聽登入/登出，動態更新按鈕
      unsub = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user ?? null;
        setIsSignedIn(!!u);
        setEmail(u?.email ?? null);
      }) as any;
    };

    run();
    return () => {
      unsub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  const goStart = () => {
    if (isSignedIn) router.push('/dashboard');
    else router.push('/login');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsSignedIn(false);
    setEmail(null);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-blue-600" />
            <span className="font-semibold text-lg">AI Knowledge Vault</span>
          </Link>

          <nav className="flex items-center gap-3">
            {!checking && !isSignedIn && (
              <>
                <Link
                  href="/login"
                  className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
                >
                  登入
                </Link>
                <Link href="/login">
                  <Button size="sm" className="gap-1">
                    開始使用
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}

            {!checking && isSignedIn && (
              <>
                <span className="hidden sm:block text-sm text-gray-600">
                  {email}
                </span>
                <Link href="/dashboard">
                  <Button size="sm" variant="secondary" className="gap-1">
                    前往 Dashboard
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={handleLogout}>
                  登出
                </Button>
              </>
            )}

            {checking && (
              <div className="text-xs text-gray-500">檢查登入中…</div>
            )}
          </nav>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="container mx-auto px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            智能知識管理系統
          </h1>
          <p className="text-gray-600 leading-7 mb-8">
            使用 AI 技術整理、搜尋和管理您的知識庫。支援文字提示和網頁連結，自動生成摘要與智能搜尋。
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button size="lg" className="gap-2" onClick={goStart}>
              立即開始
              <ArrowRight className="h-5 w-5" />
            </Button>
            {!isSignedIn && (
              <Link
                href="/login"
                className="text-sm px-4 py-2 rounded-md border hover:bg-gray-50 inline-flex items-center gap-2"
              >
                <LogIn className="h-4 w-4" />
                我已有帳號
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section className="container mx-auto px-4 pb-16">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-6">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="font-semibold mb-2">智能摘要</h3>
            <p className="text-sm leading-6 text-gray-600">
              AI 自動為您的內容生成條理中文摘要，快速了解重點資訊。
            </p>
          </div>

          <div className="rounded-xl border bg-white p-6">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold mb-2">向量搜尋</h3>
            <p className="text-sm leading-6 text-gray-600">
              基於語意相似性的智能搜尋，找到最相關的知識內容。
            </p>
          </div>

          <div className="rounded-xl border bg-white p-6">
            <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center mb-4">
              <ImageIcon className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="font-semibold mb-2">多元內容</h3>
            <p className="text-sm leading-6 text-gray-600">
              支援文字提示、網頁連結與圖片上傳，全面管理您的知識。
            </p>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} AI Knowledge Vault
        </div>
      </footer>
    </div>
  );
}
