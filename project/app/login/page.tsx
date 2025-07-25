'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Mail } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback/`,
        },
      });

      if (error) {
        toast.error('登入失敗：' + error.message);
      } else {
        toast.success('連結已發送到您的信箱！');
      }
    } catch (error) {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <Brain className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">AI Knowledge Vault</h1>
          </Link>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">歡迎回來</CardTitle>
            <CardDescription>
              輸入您的電子郵件地址，我們將發送連結給您
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  電子郵件
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '發送中...' : '發送連結'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              <Link href="/" className="text-blue-600 hover:underline">
                返回首頁
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}