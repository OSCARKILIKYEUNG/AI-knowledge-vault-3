/*
  # Fix Function Parameter Conflicts

  This migration fixes the parameter name conflicts in PostgreSQL functions
  by using different parameter names that don't conflict with column names.
*/

-- Enable the vector extension for similarity search (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table (safe to run multiple times)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create items table with vector embedding support (safe to run multiple times)
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type text CHECK (type IN ('prompt', 'link')) NOT NULL,
  title text NOT NULL,
  raw_content text NOT NULL,
  url text,
  category text[] DEFAULT '{}',
  summary text,
  embedding vector(768),
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (safe to run multiple times)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate them
DO $$
BEGIN
  -- Drop and recreate users policies
  DROP POLICY IF EXISTS "Users can read own data" ON users;
  DROP POLICY IF EXISTS "Users can insert own data" ON users;
  DROP POLICY IF EXISTS "Users can update own data" ON users;
  
  -- Drop and recreate items policies
  DROP POLICY IF EXISTS "Users can read own items" ON items;
  DROP POLICY IF EXISTS "Users can insert own items" ON items;
  DROP POLICY IF EXISTS "Users can update own items" ON items;
  DROP POLICY IF EXISTS "Users can delete own items" ON items;
END $$;

-- Create fresh policies for users table
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Create fresh policies for items table
CREATE POLICY "Users can read own items"
  ON items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own items"
  ON items
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own items"
  ON items
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own items"
  ON items
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes for better performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS items_user_id_idx ON items(user_id);
CREATE INDEX IF NOT EXISTS items_type_idx ON items(type);
CREATE INDEX IF NOT EXISTS items_created_at_idx ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS items_embedding_idx ON items USING ivfflat (embedding vector_cosine_ops);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist, then recreate them
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_items_updated_at ON items;

-- Create fresh triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS search_items(vector, float, int, uuid);
DROP FUNCTION IF EXISTS find_similar_items(uuid, vector, float, int, uuid);

-- Search functions for vector similarity (with fixed parameter names)
CREATE OR REPLACE FUNCTION search_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  target_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  title text,
  raw_content text,
  url text,
  category text[],
  summary text,
  embedding vector(768),
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.user_id,
    items.type,
    items.title,
    items.raw_content,
    items.url,
    items.category,
    items.summary,
    items.embedding,
    items.image_url,
    items.created_at,
    items.updated_at,
    1 - (items.embedding <=> query_embedding) AS similarity
  FROM items
  WHERE items.user_id = target_user_id
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to find similar items (excluding current item, with fixed parameter names)
CREATE OR REPLACE FUNCTION find_similar_items(
  target_item_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  target_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  title text,
  raw_content text,
  url text,
  category text[],
  summary text,
  embedding vector(768),
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.user_id,
    items.type,
    items.title,
    items.raw_content,
    items.url,
    items.category,
    items.summary,
    items.embedding,
    items.image_url,
    items.created_at,
    items.updated_at,
    1 - (items.embedding <=> query_embedding) AS similarity
  FROM items
  WHERE items.user_id = target_user_id
    AND items.id != target_item_id
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;