// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

/**
 * 環境變數
 * - 在本機用 .env.local
 * - 在 Vercel 專案 Settings > Environment Variables
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 為了避免在建置時直接 throw 造成整個頁面無法載入，這裡僅警告。
// 若兩者為空，後續呼叫 supabase 會失敗並在頁面顯示你加的錯誤處理。
if (!supabaseUrl || !supabaseAnonKey) {
  // 你也可以改回 throw new Error(...)，但要確保部署環境有正確的 env
  // console.warn('Supabase env missing: check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * ---- Database 型別（手動維護版）----
 * 與你目前 SQL schema 對齊：
 * users(id uuid, email text)
 * items(… + summary_tip text)
 * prompt_assets(id bigint, item_id bigint, image_url text)
 *
 * 若你之後有再加欄位，記得也要在這裡同步補上。
 */
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;    // uuid
          email: string | null;
        };
        Insert: {
          id: string;
          email?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
        };
      };

      items: {
        Row: {
          id: number;                          // bigint
          user_id: string;                     // uuid
          type: 'prompt' | 'link';
          title: string | null;
          raw_content: string | null;
          url: string | null;
          summary: string | null;              // AI 長摘要（可選）
          summary_tip: string | null;          // ✅ 新增：卡片用 30 字內極簡摘要
          category: string[] | null;
          embedding: number[] | null;          // vector(768) 以 number[] 表示
          created_at: string;                  // timestamptz
        };
        Insert: {
          id?: number;
          user_id: string;
          type: 'prompt' | 'link';
          title?: string | null;
          raw_content?: string | null;
          url?: string | null;
          summary?: string | null;
          summary_tip?: string | null;         // ✅ 支援插入
          category?: string[] | null;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          type?: 'prompt' | 'link';
          title?: string | null;
          raw_content?: string | null;
          url?: string | null;
          summary?: string | null;
          summary_tip?: string | null;         // ✅ 支援更新
          category?: string[] | null;
          embedding?: number[] | null;
          created_at?: string;
        };
        // 關聯（如需 join 用）這裡可省略或依需要補充
        Relationships: [];
      };

      prompt_assets: {
        Row: {
          id: number;                // bigint
          item_id: number;           // bigint -> items.id
          image_url: string | null;
        };
        Insert: {
          id?: number;
          item_id: number;
          image_url?: string | null;
        };
        Update: {
          id?: number;
          item_id?: number;
          image_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_assets_item_id_fkey';
            columns: ['item_id'];
            referencedRelation: 'items';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
