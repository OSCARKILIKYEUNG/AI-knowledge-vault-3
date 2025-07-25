'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brain } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState('處理中...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        setStatus('驗證登入狀態...');
        
        // Handle the auth callback from URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          setStatus('設定登入狀態...');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('Session error:', error);
            setStatus('登入失敗，正在重新導向...');
            setTimeout(() => router.push('/login?error=session_failed'), 2000);
            return;
          }
          
          if (data.session) {
            setStatus('登入成功！正在重新導向...');
            setTimeout(() => router.push('/dashboard'), 1000);
            return;
          }
        }
        
        // Fallback: check existing session
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setStatus('驗證失敗，正在重新導向...');
          setTimeout(() => router.push('/login?error=auth_failed'), 2000);
          return;
        }

        if (data.session) {
          setStatus('登入成功！正在重新導向...');
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          setStatus('未找到登入狀態，正在重新導向...');
          setTimeout(() => router.push('/login'), 2000);
        }
      } catch (error) {
        console.error('Callback error:', error);
        setStatus('處理失敗，正在重新導向...');
        setTimeout(() => router.push('/login?error=callback_failed'), 2000);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="text-center">
        <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">登入驗證</h2>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
}