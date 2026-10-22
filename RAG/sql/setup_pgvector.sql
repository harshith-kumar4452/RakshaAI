create extension if not exists vector;

create table if not exists legal_chunks (
  id            uuid primary key default gen_random_uuid(),
  act_name      text not null,
  section_num   text,
  section_title text,
  chunk_text    text not null,
  chunk_index   integer,
  embedding     vector(768),
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

create unique index if not exists legal_chunks_act_section_unique
  on legal_chunks (act_name, section_num);

create index if not exists legal_chunks_embedding_idx
  on legal_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create or replace function match_legal_sections(
  query_embedding vector(768),
  match_count     int default 5,
  filter_act      text default null
)
returns table(
  id            uuid,
  act_name      text,
  section_num   text,
  section_title text,
  chunk_text    text,
  similarity    float
)
language sql stable as $$
  select id, act_name, section_num, section_title, chunk_text,
         1 - (embedding <=> query_embedding) as similarity
  from legal_chunks
  where (filter_act is null or act_name = filter_act)
  order by embedding <=> query_embedding
  limit match_count;
$$;
