'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Brain } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        console.log('[Home] checking session...');
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Home] getSession error:', error);
          router.replace('/login');
          return;
        }
        if (data?.session?.user) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      } catch (e) {
        console.error('[Home] unexpected:', e);
        router.replace('/login');
      } finally {
        setChecking(false);
      }
    };
    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Brain className="h-12 w-12 text-blue-600 animate-pulse mx-auto mb-4" />
        <p className="text-gray-600">載入中...</p>
      </div>
    </div>
  );
}
