import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabaseClient] Missing env vars NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// === 型別定義（修正 items.id 使用 bigint -> number）===
export type Database = {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string | null }
        Insert: { id: string; email?: string | null }
        Update: { id?: string; email?: string | null }
      }
      items: {
        Row: {
          id: number
          user_id: string
          type: 'prompt' | 'link'
          title: string | null
          raw_content: string | null
          url: string | null
          summary: string | null
          category: string[] | null
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          type: 'prompt' | 'link'
          title?: string | null
          raw_content?: string | null
          url?: string | null
          summary?: string | null
          category?: string[] | null
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          type?: 'prompt' | 'link'
          title?: string | null
          raw_content?: string | null
          url?: string | null
          summary?: string | null
          category?: string[] | null
          embedding?: number[] | null
          created_at?: string
        }
      }
      prompt_assets: {
        Row: { id: number; item_id: number; image_url: string | null }
        Insert: { id?: number; item_id: number; image_url?: string | null }
        Update: { id?: number; item_id?: number; image_url?: string | null }
      }
    }
  }
}
