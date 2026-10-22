from __future__ import annotations

import json
import re
from typing import Any

from ollama import Client

from src.settings import load_settings


SYSTEM_PROMPT = """You are Justra's legal triage assistant for Indian law.
Given a harassment complaint and retrieved legal context, return a JSON object.
Be concise and use plain language - not legal jargon.
Always return valid JSON only. No markdown. No explanation outside JSON.

Return format:
{
  "applicable_sections": [{"act": "", "section": "", "why_relevant": ""}],
  "recommended_authority": "ICC | HR | Police | Court | HSE",
  "victim_rights": ["right 1", "right 2"],
  "mandatory_reporting": true | false,
  "mandatory_reporting_reason": "",
  "sla_days": 90,
  "plain_summary": "1-2 sentence plain language summary"
}

IMPORTANT: If the complaint involves anyone under 18, always set mandatory_reporting: true
and recommended_authority: "Police" per POCSO section 19.
"""


def _extract_json(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model response")
    return json.loads(cleaned[start : end + 1])


def _minor_detected(text: str) -> bool:
    pattern = r"\b(under\s*18|minor|16-year-old|17-year-old|child|school\s+student)\b"
    return bool(re.search(pattern, text.lower()))


def synthesize(complaint: str, category: str, retrieval_result: dict[str, Any]) -> dict[str, Any]:
    settings = load_settings()
    client = Client(host=settings.ollama_base_url)

    vector_context = "\n\n".join(
        [
            f"[{row.get('act_name')} s.{row.get('section_num')}] {row.get('section_title')}\n{row.get('chunk_text')}"
            for row in retrieval_result.get("vector_chunks", [])
        ]
    )

    graph_context = "\n".join(
        [
            f"{row.get('act')} s.{row.get('section')} -> {row.get('offence')} ({row.get('rel')})"
            for row in retrieval_result.get("graph_paths", [])
        ]
    )

    user_prompt = (
        f"Category: {category}\n\n"
        f"Complaint:\n{complaint}\n\n"
        f"Vector Context:\n{vector_context or 'No vector context found.'}\n\n"
        f"Graph Context:\n{graph_context or 'No graph context found.'}\n"
    )

    response = client.chat(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.2},
    )

    content = response["message"]["content"]
    result = _extract_json(content)

    if _minor_detected(complaint) or category == "minor_involved":
        result["mandatory_reporting"] = True
        result["recommended_authority"] = "Police"
        if not result.get("mandatory_reporting_reason"):
            result["mandatory_reporting_reason"] = "Potential minor involved; POCSO mandatory reporting applies."

    return result
