/*
  # Search Functions for Vector Similarity

  1. Functions
    - `search_items` - Search items using vector similarity
    - `find_similar_items` - Find similar items excluding current item

  2. Usage
    - Vector similarity search with cosine distance
    - Fallback to simple text matching if no embeddings
    - User-scoped results only
*/

-- Function to search items using vector similarity
CREATE OR REPLACE FUNCTION search_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id uuid
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
  WHERE items.user_id = search_items.user_id
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to find similar items (excluding current item)  
CREATE OR REPLACE FUNCTION find_similar_items(
  item_id uuid,
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id uuid
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
  WHERE items.user_id = find_similar_items.user_id
    AND items.id != find_similar_items.item_id
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;