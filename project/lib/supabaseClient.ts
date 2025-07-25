import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_url' || supabaseAnonKey === 'your_supabase_anon_key') {
  throw new Error(`
Missing or invalid Supabase environment variables. 

Please update your .env.local file with valid values:
- NEXT_PUBLIC_SUPABASE_URL should be your actual Supabase project URL (e.g., https://your-project.supabase.co)
- NEXT_PUBLIC_SUPABASE_ANON_KEY should be your actual anon key from Supabase dashboard

Current values:
- NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl || 'undefined'}
- NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '[SET]' : 'undefined'}

Get these values from: https://supabase.com/dashboard/project/[your-project]/settings/api
  `);
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (error) {
  throw new Error(`
Invalid NEXT_PUBLIC_SUPABASE_URL format: ${supabaseUrl}

The URL should be in format: https://your-project-id.supabase.co
Please check your Supabase project settings and update .env.local
  `);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          type: 'prompt' | 'link';
          title: string;
          raw_content: string;
          url?: string;
          category: string[];
          summary?: string;
          embedding?: number[];
          image_url?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'prompt' | 'link';
          title: string;
          raw_content: string;
          url?: string;
          category?: string[];
          summary?: string;
          embedding?: number[];
          image_url?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'prompt' | 'link';
          title?: string;
          raw_content?: string;
          url?: string;
          category?: string[];
          summary?: string;
          embedding?: number[];
          image_url?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};