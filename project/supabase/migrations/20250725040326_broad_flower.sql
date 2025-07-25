/*
  # AI Knowledge Vault Database Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - matches Supabase auth.users.id
      - `email` (text, unique) - user email
      - `created_at` (timestamptz) - account creation time
      - `updated_at` (timestamptz) - last update time
    
    - `items`
      - `id` (uuid, primary key) - unique item identifier
      - `user_id` (uuid, foreign key) - references users.id
      - `type` (text) - either 'prompt' or 'link'
      - `title` (text) - item title
      - `raw_content` (text) - original content
      - `url` (text, nullable) - URL for link items
      - `category` (text array) - categories/tags
      - `summary` (text, nullable) - AI-generated summary in Traditional Chinese
      - `embedding` (vector(768), nullable) - text embedding for similarity search
      - `image_url` (text, nullable) - uploaded image URL
      - `created_at` (timestamptz) - creation time
      - `updated_at` (timestamptz) - last update time

  2. Security
    - Enable RLS on both tables
    - Users can only access their own data
    - Policies for authenticated users to CRUD their own records

  3. Extensions
    - Enable vector extension for similarity search
    - Create indexes for performance
*/

-- Enable the vector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create items table with vector embedding support
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

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
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

-- RLS Policies for items table
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

-- Create indexes for better performance
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

-- Triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();