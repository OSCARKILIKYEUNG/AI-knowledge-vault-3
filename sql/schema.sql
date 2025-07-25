-- Combined schema + RLS + function
create extension if not exists "vector";
create table if not exists users (
  id uuid primary key,
  email text
);
create table if not exists items (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete cascade,
  type text check (type in ('prompt','link')) not null,
  title text,
  raw_content text,
  url text,
  summary text,
  category text[],
  embedding vector(768),
  created_at timestamptz default now()
);
create table if not exists prompt_assets (
  id bigint generated always as identity primary key,
  item_id bigint references items(id) on delete cascade,
  image_url text
);
create index if not exists items_embedding_idx on items using ivfflat (embedding vector_cosine_ops) with (lists=100);

alter table users enable row level security;
alter table items enable row level security;
alter table prompt_assets enable row level security;
create policy "select own user" on users for select using (auth.uid() = id);
create policy "insert own user" on users for insert with check (auth.uid() = id);
create policy "manage own items" on items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "manage own prompt assets" on prompt_assets for all using (
  exists (select 1 from items i where i.id = prompt_assets.item_id and i.user_id = auth.uid())
) with check (
  exists (select 1 from items i where i.id = prompt_assets.item_id and i.user_id = auth.uid())
);
create or replace function match_items(user_uuid uuid, query_embedding vector, match_count int default 20)
returns table (id bigint, title text, summary text, distance double precision) as $$
  select i.id, i.title, i.summary, (i.embedding <-> query_embedding) as distance
  from items i
  where i.user_id = user_uuid and i.embedding is not null
  order by i.embedding <-> query_embedding
  limit match_count;
$$ language sql stable;
