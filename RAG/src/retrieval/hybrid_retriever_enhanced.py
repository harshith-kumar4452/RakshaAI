"""
Enhanced hybrid retriever with BM25 + Vector Search + Metadata Filtering
Implements RAG best practices: reranking, query expansion, metadata filtering
"""
from __future__ import annotations

import logging
from typing import Any

from ollama import Client as OllamaClient
from supabase import Client as SupabaseClient
from supabase import create_client

from src.settings import load_settings


logger = logging.getLogger(__name__)


def _embed_query(client: OllamaClient, model: str, text: str) -> list[float]:
    """Embed query text using Ollama"""
    response = client.embed(model=model, input=text)
    if "embeddings" in response and response["embeddings"]:
        return response["embeddings"][0]
    if "embedding" in response and response["embedding"]:
        return response["embedding"]
    raise ValueError("Unexpected embedding response from Ollama")


def hybrid_search(
    query: str,
    k: int = 10,
    act_filter: str | None = None,
    category_filter: str | None = None,
    vector_weight: float = 0.5,
    min_similarity: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Hybrid search combining BM25 keyword search + vector semantic search

    Args:
        query: Search query text
        k: Number of results to return
        act_filter: Filter by specific act (e.g., "BNS 2023")
        category_filter: Filter by category (e.g., "sexual_harassment")
        vector_weight: 0.0 = pure BM25, 1.0 = pure vector, 0.5 = balanced
        min_similarity: Minimum hybrid score threshold

    Returns:
        List of chunks with hybrid scores
    """
    settings = load_settings()
    ollama_client = OllamaClient(host=settings.ollama_base_url)
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )

    # Generate query embedding
    query_embedding = _embed_query(ollama_client, settings.embed_model, query)

    try:
        # Call hybrid search RPC function
        response = supabase_client.rpc(
            "hybrid_search_legal_sections",
            {
                "query_text": query,
                "query_embedding": query_embedding,
                "match_count": k,
                "filter_act": act_filter,
                "filter_category": category_filter,
                "vector_weight": vector_weight,
                "min_similarity": min_similarity,
            },
        ).execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "chunk_text": row["chunk_text"],
                    "hybrid_score": row["hybrid_score"],
                    "vector_score": row["vector_score"],
                    "bm25_score": row["bm25_score"],
                    "category": row.get("category"),
                }
            )

        logger.info(f"Hybrid search returned {len(results)} results")
        return results

    except Exception as e:
        logger.warning(f"Hybrid search failed: {e}. Falling back to vector-only search.")
        return vector_search(query, k, act_filter)


def vector_search(
    query: str,
    k: int = 5,
    act_filter: str | None = None,
) -> list[dict[str, Any]]:
    """
    Pure vector similarity search (semantic search)

    Args:
        query: Search query text
        k: Number of results to return
        act_filter: Filter by specific act

    Returns:
        List of semantically similar chunks
    """
    settings = load_settings()
    ollama_client = OllamaClient(host=settings.ollama_base_url)
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )

    # Generate query embedding
    query_embedding = _embed_query(ollama_client, settings.embed_model, query)

    try:
        response = supabase_client.rpc(
            "match_legal_sections",
            {
                "query_embedding": query_embedding,
                "match_count": k,
                "filter_act": act_filter,
            },
        ).execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "chunk_text": row["chunk_text"],
                    "similarity": row["similarity"],
                }
            )

        logger.info(f"Vector search returned {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []


def keyword_search(
    query: str,
    k: int = 10,
    act_filter: str | None = None,
    category_filter: str | None = None,
) -> list[dict[str, Any]]:
    """
    Pure BM25 keyword search (exact phrase matching)

    Args:
        query: Search keywords or phrases
        k: Number of results to return
        act_filter: Filter by specific act
        category_filter: Filter by category

    Returns:
        List of keyword-matched chunks with highlighted snippets
    """
    settings = load_settings()
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )

    try:
        response = supabase_client.rpc(
            "keyword_search_legal_sections",
            {
                "query_text": query,
                "match_count": k,
                "filter_act": act_filter,
                "filter_category": category_filter,
            },
        ).execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "chunk_text": row["chunk_text"],
                    "rank": row["rank"],
                    "headline": row["headline"],  # Highlighted snippet with <mark> tags
                }
            )

        logger.info(f"Keyword search returned {len(results)} results")
        return results

    except Exception as e:
        logger.error(f"Keyword search failed: {e}")
        return []


def multi_query_retrieval(
    query: str,
    k: int = 10,
    llm_model: str | None = None,
    ollama_base_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Multi-query retrieval: Generate multiple query variations and merge results

    RAG Best Practice: Generate semantically similar queries to improve recall

    Args:
        query: Original user query
        k: Total number of results to return (after deduplication)
        llm_model: LLM model for query generation
        ollama_base_url: Ollama API URL

    Returns:
        Deduplicated and merged results from multiple query variations
    """
    settings = load_settings()
    if not llm_model:
        llm_model = settings.llm_model
    if not ollama_base_url:
        ollama_base_url = settings.ollama_base_url

    client = OllamaClient(host=ollama_base_url)

    # Generate query variations
    prompt = (
        f"Given the query: '{query}'\n\n"
        "Generate 3 alternative queries that capture the same intent using different wording.\n"
        "Focus on legal terminology variations and synonyms.\n"
        "Return only the 3 queries, one per line, without numbering or explanation."
    )

    try:
        response = client.chat(
            model=llm_model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.3},
        )
        variations = response["message"]["content"].strip().split("\n")
        variations = [v.strip("- 123.") for v in variations if v.strip()][:3]
        queries = [query] + variations

        logger.info(f"Generated query variations: {queries}")

    except Exception as e:
        logger.warning(f"Query expansion failed: {e}. Using original query only.")
        queries = [query]

    # Search with each query variation
    all_results = {}
    for q in queries:
        results = hybrid_search(q, k=k // len(queries) + 2, vector_weight=0.6)
        for result in results:
            chunk_id = result["id"]
            if chunk_id not in all_results or result["hybrid_score"] > all_results[chunk_id]["hybrid_score"]:
                all_results[chunk_id] = result

    # Sort by hybrid score and return top k
    merged = sorted(all_results.values(), key=lambda x: x.get("hybrid_score", 0), reverse=True)[:k]

    logger.info(f"Multi-query retrieval returned {len(merged)} unique results")
    return merged


def retrieve_by_severity(
    severity: str,
    k: int = 10,
) -> list[dict[str, Any]]:
    """
    Retrieve sections by severity level

    Args:
        severity: 'low', 'medium', 'high', or 'critical'
        k: Number of results

    Returns:
        List of sections matching severity level
    """
    settings = load_settings()
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )

    try:
        response = supabase_client.rpc(
            "find_by_severity",
            {"severity_level": severity, "match_count": k},
        ).execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "severity": row["severity"],
                }
            )

        logger.info(f"Retrieved {len(results)} sections with severity={severity}")
        return results

    except Exception as e:
        logger.error(f"Severity search failed: {e}")
        return []


def retrieve_mandatory_reporting() -> list[dict[str, Any]]:
    """
    Retrieve all sections with mandatory reporting requirements

    Returns:
        List of sections requiring mandatory reporting (e.g., POCSO cases)
    """
    settings = load_settings()
    supabase_client: SupabaseClient = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )

    try:
        response = supabase_client.rpc("find_mandatory_reporting_sections").execute()

        results = []
        for row in response.data:
            results.append(
                {
                    "id": row["id"],
                    "act_name": row["act_name"],
                    "section_num": row["section_num"],
                    "section_title": row["section_title"],
                    "category": row["category"],
                }
            )

        logger.info(f"Retrieved {len(results)} mandatory reporting sections")
        return results

    except Exception as e:
        logger.error(f"Mandatory reporting search failed: {e}")
        return []


def contextual_compression_retrieval(
    query: str,
    k: int = 10,
    compression_k: int = 3,
    llm_model: str | None = None,
    ollama_base_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Contextual compression: Retrieve more docs, then compress to most relevant

    RAG Best Practice: Cast a wide net, then use LLM to filter to most relevant

    Args:
        query: Search query
        k: Number of initial results to retrieve
        compression_k: Number of compressed/filtered results to return
        llm_model: LLM for relevance scoring
        ollama_base_url: Ollama API URL

    Returns:
        Compressed list of most relevant chunks
    """
    settings = load_settings()
    if not llm_model:
        llm_model = settings.llm_model
    if not ollama_base_url:
        ollama_base_url = settings.ollama_base_url

    # Retrieve more results initially
    results = hybrid_search(query, k=k, vector_weight=0.5)

    if len(results) <= compression_k:
        return results

    # Use LLM to score relevance
    client = OllamaClient(host=ollama_base_url)

    scored_results = []
    for result in results:
        prompt = (
            f"Query: {query}\n\n"
            f"Document: {result['section_title']}\n{result['chunk_text'][:500]}\n\n"
            "On a scale of 0-10, how relevant is this document to answering the query?\n"
            "Respond with ONLY a number between 0 and 10."
        )

        try:
            response = client.chat(
                model=llm_model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0},
            )
            score_text = response["message"]["content"].strip()
            score = float(score_text) if score_text.replace(".", "").isdigit() else 5.0
            result["relevance_score"] = score
            scored_results.append(result)

        except Exception as e:
            logger.warning(f"Relevance scoring failed: {e}")
            result["relevance_score"] = result.get("hybrid_score", 0.5) * 10
            scored_results.append(result)

    # Sort by relevance and return top compression_k
    compressed = sorted(scored_results, key=lambda x: x["relevance_score"], reverse=True)[:compression_k]

    logger.info(f"Compressed {len(results)} results to {len(compressed)}")
    return compressed


def hybrid_retrieve(
    complaint_text: str,
    category: str | None = None,
    k: int = 10,
    use_multi_query: bool = False,
    use_compression: bool = False,
) -> dict[str, Any]:
    """
    Unified hybrid retrieval interface with multiple strategies

    Args:
        complaint_text: User complaint or query
        category: Category filter (sexual_harassment, cybercrime, etc.)
        k: Number of results
        use_multi_query: Enable multi-query expansion
        use_compression: Enable contextual compression

    Returns:
        Dict with retrieval results and metadata
    """

    if use_multi_query:
        chunks = multi_query_retrieval(complaint_text, k=k)
    elif use_compression:
        chunks = contextual_compression_retrieval(complaint_text, k=k * 2, compression_k=k)
    else:
        chunks = hybrid_search(complaint_text, k=k, category_filter=category, vector_weight=0.6)

    return {
        "query": complaint_text,
        "category": category,
        "chunks": chunks,
        "total_results": len(chunks),
        "retrieval_strategy": "multi_query" if use_multi_query else "compression" if use_compression else "hybrid",
    }
