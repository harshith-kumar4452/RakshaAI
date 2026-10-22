from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import fitz
import tiktoken


SECTION_PATTERN = re.compile(r"^\s*(\d+[A-Z]?)\.\s+(.+)$")

# Hierarchical chunking parameters
MAX_CHUNK_TOKENS = 512  # Maximum tokens per chunk
OVERLAP_TOKENS = 50  # Overlap between chunks
ENCODING = tiktoken.get_encoding("cl100k_base")  # GPT-4 tokenizer

ACT_NAME_BY_FILE = {
    "bns.md": "BNS 2023",
    "itact2000.md": "IT Act 2000",
    "poshact2013.md": "POSH Act 2013",
    "pocsoact2012.md": "POCSO Act 2012",
    "cybercomplaint.md": "Filing a cyber complaint",
}


def _read_pdf_text(file_path: Path) -> str:
    text_parts: list[str] = []
    with fitz.open(file_path) as doc:
        for page in doc:
            page_text = page.get_text("text")  # type: ignore
            if isinstance(page_text, str):
                text_parts.append(page_text)
    return "\n".join(text_parts)


def _read_raw_text(file_path: Path) -> str:
    if file_path.suffix.lower() == ".pdf":
        return _read_pdf_text(file_path)
    return file_path.read_text(encoding="utf-8", errors="ignore")


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _count_tokens(text: str) -> int:
    """Count tokens in text using tiktoken."""
    return len(ENCODING.encode(text))


def _split_text_by_tokens(
    text: str, max_tokens: int = MAX_CHUNK_TOKENS, overlap_tokens: int = OVERLAP_TOKENS
) -> list[str]:
    """Split text into chunks with token-based size control and overlap."""
    tokens = ENCODING.encode(text)
    chunks: list[str] = []
    
    if len(tokens) <= max_tokens:
        return [text]
    
    start = 0
    while start < len(tokens):
        end = start + max_tokens
        chunk_tokens = tokens[start:end]
        chunk_text = ENCODING.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        # Move forward by (max_tokens - overlap_tokens) to create overlap
        start += max_tokens - overlap_tokens
    
    return chunks


def _format_chunk_text(act_name: str, section_num: str, section_title: str, body: str) -> str:
    return f"{act_name} Section {section_num} - {section_title}\n\n{body.strip()}"


def _chunk_from_sections(text: str, act_name: str, source_file: str) -> list[dict[str, Any]]:
    """Extract sections and apply hierarchical chunking with overlap."""
    chunks: list[dict[str, Any]] = []
    current_num: str | None = None
    current_title: str | None = None
    current_lines: list[str] = []

    def _process_section(section_num: str, section_title: str, section_body: str) -> None:
        """Process a single section and split into sub-chunks if needed."""
        formatted_header = f"{act_name} Section {section_num} - {section_title}\n\n"
        full_text = formatted_header + section_body
        
        # Check token count of the full section
        token_count = _count_tokens(full_text)
        
        if token_count <= MAX_CHUNK_TOKENS:
            # Section fits in one chunk
            chunks.append(
                {
                    "act_name": act_name,
                    "section_num": section_num,
                    "section_title": section_title,
                    "chunk_text": full_text.strip(),
                    "metadata": {
                        "source_file": source_file,
                        "parse_mode": "section_regex",
                        "token_count": token_count,
                        "is_sub_chunk": False,
                        "sub_chunk_index": 0,
                        "total_sub_chunks": 1,
                    },
                }
            )
        else:
            # Section needs to be split into sub-chunks with overlap
            # Split only the body, then add header to each sub-chunk
            body_sub_chunks = _split_text_by_tokens(section_body, MAX_CHUNK_TOKENS - _count_tokens(formatted_header))
            
            for sub_idx, body_chunk in enumerate(body_sub_chunks):
                chunk_text = formatted_header + body_chunk
                chunks.append(
                    {
                        "act_name": act_name,
                        "section_num": f"{section_num}.{sub_idx + 1}",  # Make unique: 111.1, 111.2, etc.
                        "section_title": f"{section_title} (Part {sub_idx + 1}/{len(body_sub_chunks)})",
                        "chunk_text": chunk_text.strip(),
                        "metadata": {
                            "source_file": source_file,
                            "parse_mode": "section_regex_hierarchical",
                            "token_count": _count_tokens(chunk_text),
                            "is_sub_chunk": True,
                            "sub_chunk_index": sub_idx,
                            "total_sub_chunks": len(body_sub_chunks),
                            "parent_section": section_num,
                        },
                    }
                )

    # Parse sections
    for line in text.split("\n"):
        match = SECTION_PATTERN.match(line)
        if match:
            # Process previous section if exists
            if current_num and current_title and current_lines:
                body = "\n".join(current_lines).strip()
                _process_section(current_num, current_title, body)
            
            # Start new section
            current_num = match.group(1).strip()
            current_title = match.group(2).strip()
            current_lines = []
        elif current_num is not None:
            current_lines.append(line)

    # Process final section
    if current_num and current_title and current_lines:
        body = "\n".join(current_lines).strip()
        _process_section(current_num, current_title, body)

    return chunks


def _chunk_fallback(text: str, act_name: str, source_file: str, tokens_per_chunk: int = MAX_CHUNK_TOKENS) -> list[dict[str, Any]]:
    """Fallback chunking using token-based splitting with overlap."""
    chunks: list[dict[str, Any]] = []
    
    # Split text into chunks with overlap
    text_chunks = _split_text_by_tokens(text, tokens_per_chunk, OVERLAP_TOKENS)
    
    for idx, chunk_text in enumerate(text_chunks):
        section_num = f"FALLBACK-{idx + 1}"
        section_title = f"Fallback chunk {idx + 1}/{len(text_chunks)}"
        full_text = _format_chunk_text(act_name, section_num, section_title, chunk_text)
        
        chunks.append(
            {
                "act_name": act_name,
                "section_num": section_num,
                "section_title": section_title,
                "chunk_text": full_text,
                "metadata": {
                    "source_file": source_file,
                    "parse_mode": "fallback_tokens",
                    "token_count": _count_tokens(full_text),
                    "is_sub_chunk": True,
                    "sub_chunk_index": idx,
                    "total_sub_chunks": len(text_chunks),
                },
            }
        )

    return chunks


def extract_chunks(file_path: str, act_name: str | None = None) -> list[dict[str, Any]]:
    """Extract chunks from legal documents with hierarchical chunking."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {file_path}")

    resolved_act = act_name or ACT_NAME_BY_FILE.get(path.name.lower())
    if not resolved_act:
        raise ValueError(
            f"Unknown act name for file '{path.name}'. Pass act_name explicitly or update ACT_NAME_BY_FILE."
        )

    raw = _normalize_text(_read_raw_text(path))
    if not raw:
        return []

    chunks = _chunk_from_sections(raw, resolved_act, path.name)
    if len(chunks) < 2:
        chunks = _chunk_fallback(raw, resolved_act, path.name)

    for idx, chunk in enumerate(chunks):
        chunk["chunk_index"] = idx

    return chunks
