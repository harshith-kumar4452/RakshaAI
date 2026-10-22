# Justra RAG Backend

Hybrid legal retrieval pipeline for Justra using:
- Supabase pgvector for chunk embeddings and retrieval
- Ollama for embeddings and synthesis
- Optional Neo4j graph extraction utilities (not required for current ingestion path)

## 1) Setup

1. Install Python 3.13.12 and uv.
2. Install dependencies:

```bash
uv sync
```

3. Prepare environment:

```bash
copy .env.example .env
```

Use your existing `.env` values. The loader supports both key styles:
- `SUPABASE_URL` or `API_URL`
- `SUPABASE_SERVICE_KEY` or `service_role`

## 2) Supabase SQL

Run the SQL in [sql/setup_pgvector.sql](sql/setup_pgvector.sql) inside the Supabase SQL editor.

## 3) Ingest

Ingest legal markdown documents from the `Data` folder:

```bash
cd RAG
uv run python main.py
```

What happens:
- Chunks are extracted by section regex, fallback every 500 tokens when regex misses
- Each chunk is embedded with `nomic-embed-text`
- Entities/relationships are extracted with `qwen2.5:1.5b`
- Everything is upserted to `legal_chunks`, with graph payload stored in `metadata`

## 4) Test Retrieval + Synthesis

```bash
cd RAG
uv run python main.py --test
```

This runs sample complaints through:
- vector retrieval (`match_legal_sections` RPC)
- optional graph retrieval (returns empty when Neo4j is not configured)
- legal synthesis JSON output

## Project Structure

- [src/ingest/chunker.py](src/ingest/chunker.py)
- [src/ingest/embedder.py](src/ingest/embedder.py)
- [src/ingest/graph_builder.py](src/ingest/graph_builder.py)
- [src/retrieval/hybrid_retriever.py](src/retrieval/hybrid_retriever.py)
- [src/synthesis/legal_synthesizer.py](src/synthesis/legal_synthesizer.py)
- [main.py](main.py)
- [sql/setup_pgvector.sql](sql/setup_pgvector.sql)

## Notes

- Graph extraction failures are logged and do not stop vector ingestion.
- Neo4j write logic exists in `graph_builder.py`, but current flow stores graph extraction in Supabase metadata as requested.
- Supabase writes always use service-role credentials from `.env`.
