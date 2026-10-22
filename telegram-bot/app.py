import logging
import os
import sqlite3
import threading
import time
from typing import Any, Optional

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify
from groq import Groq  # type: ignore[reportMissingImports]
from supabase import Client, create_client

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile").strip()
TELEGRAM_POLL_INTERVAL = float(os.getenv("TELEGRAM_POLL_INTERVAL", "2") or 2)
PORT = int(os.getenv("PORT", "8000") or 8000)

if not TELEGRAM_BOT_TOKEN:
    raise RuntimeError("Missing TELEGRAM_BOT_TOKEN in .env")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
groq_client: Optional[Groq] = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

DB_PATH = "chat_links.db"
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_links (
              chat_id TEXT PRIMARY KEY,
              case_ref TEXT NOT NULL,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def set_chat_case(chat_id: str, case_ref: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO chat_links(chat_id, case_ref)
            VALUES(?, ?)
            ON CONFLICT(chat_id)
            DO UPDATE SET case_ref=excluded.case_ref, updated_at=CURRENT_TIMESTAMP
            """,
            (chat_id, case_ref),
        )
        conn.commit()
    finally:
        conn.close()


def get_chat_case(chat_id: str) -> Optional[str]:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("SELECT case_ref FROM chat_links WHERE chat_id=?", (chat_id,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def send_message(chat_id: int, text: str) -> None:
    requests.post(
        f"{TELEGRAM_API_BASE}/sendMessage",
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=20,
    )


def safe_single_from_query(query: Any) -> Optional[dict[str, Any]]:
    try:
        res = query.limit(1).execute()
        data = getattr(res, "data", None) or []
        return data[0] if data else None
    except Exception:
        return None


def resolve_case(case_ref: str) -> Optional[dict[str, Any]]:
    ref = str(case_ref or "").strip()
    if not ref:
        return None

    complaint = safe_single_from_query(
        supabase.table("complaints")
        .select(
            "id, token, status, summary, description, incident_type, location_general, location_detail, accused_name, routed_to, escalated_to, urgency, severity, updated_at"
        )
        .eq("token", ref)
    )

    if complaint is None:
        complaint = safe_single_from_query(
            supabase.table("complaints")
            .select(
                "id, token, status, summary, description, incident_type, location_general, location_detail, accused_name, routed_to, escalated_to, urgency, severity, updated_at"
            )
            .eq("id", ref)
        )

    case_row = None
    if complaint and complaint.get("id"):
        case_row = safe_single_from_query(
            supabase.table("cases")
            .select("*")
            .eq("id", complaint["id"])
        )

    if case_row is None:
        case_row = safe_single_from_query(
            supabase.table("cases")
            .select("*")
            .eq("token", ref)
        )

    if case_row is None:
        case_row = safe_single_from_query(
            supabase.table("cases")
            .select("*")
            .eq("id", ref)
        )

    if complaint is None and case_row is None:
        return None

    case_id = (case_row or {}).get("id") or (complaint or {}).get("id")
    case_token = (case_row or {}).get("token") or (complaint or {}).get("token") or ref

    return {
        "case_id": case_id,
        "case_token": case_token,
        "complaint": complaint,
        "case": case_row,
    }


def get_workflow(status: str) -> Optional[dict[str, Any]]:
    safe_status = str(status or "").strip().lower()
    if not safe_status:
        return None

    return safe_single_from_query(
        supabase.table("case_status_workflow")
        .select("status, next_status, eta_days, routed_to")
        .eq("status", safe_status)
    )


def format_status(payload: dict[str, Any]) -> str:
    case_row = payload.get("case") or {}
    complaint = payload.get("complaint") or {}

    status = case_row.get("status") or complaint.get("status") or "submitted"
    routed_to = case_row.get("routed_to") or complaint.get("routed_to")
    escalated_to = case_row.get("escalated_to") or complaint.get("escalated_to")
    summary = case_row.get("summary") or complaint.get("summary") or "No summary yet."

    workflow = get_workflow(status)
    eta_days = workflow.get("eta_days") if workflow else None
    next_status = workflow.get("next_status") if workflow else None

    lines = [
        f"Case: {payload.get('case_token') or payload.get('case_id')}",
        f"Status: {str(status).replace('_', ' ').title()}",
    ]

    if routed_to:
        lines.append(f"Routed to: {routed_to}")
    if escalated_to:
        lines.append(f"Escalated to: {escalated_to}")
    if next_status:
        lines.append(f"Next: {str(next_status).replace('_', ' ').title()}")
    if isinstance(eta_days, int):
        lines.append(f"ETA: {eta_days} day(s)")

    lines.append("")
    lines.append(f"Summary: {summary}")
    return "\n".join(lines)


def help_text() -> str:
    return "\n".join(
        [
            "Justra Status Bot (Local Polling)",
            "/connect <case_id_or_token> - link your case",
            "/status - get latest status",
            "Send any normal text (without /) to ask a brief case query",
            "/help - show this help",
        ]
    )


def safe_text(value: Any) -> str:
    return str(value or "").strip()


def get_legal_chunks(query_text: str) -> list[dict[str, Any]]:
    query = safe_text(query_text)
    if not query:
        return []

    try:
        rpc_res = supabase.rpc(
            "keyword_search_legal_sections",
            {
                "query_text": query,
                "match_count": 4,
            },
        ).execute()
        rpc_data = getattr(rpc_res, "data", None) or []
        if isinstance(rpc_data, list) and rpc_data:
            return rpc_data[:4]
    except Exception:
        pass

    try:
        res = (
            supabase.table("legal_chunks")
            .select("act_name, section_num, section_title, chunk_text")
            .or_(f"chunk_text.ilike.%{query}%,section_title.ilike.%{query}%,act_name.ilike.%{query}%")
            .limit(4)
            .execute()
        )
        return (getattr(res, "data", None) or [])[:4]
    except Exception:
        return []


def build_query_context(case_payload: dict[str, Any], user_query: str, legal_chunks: list[dict[str, Any]]) -> dict[str, Any]:
    case_row = case_payload.get("case") or {}
    complaint = case_payload.get("complaint") or {}

    return {
        "question": safe_text(user_query),
        "case": {
            "id": case_payload.get("case_id"),
            "token": case_payload.get("case_token"),
            "status": case_row.get("status") or complaint.get("status"),
            "summary": case_row.get("summary") or complaint.get("summary"),
            "description": case_row.get("description") or complaint.get("description"),
            "priority_score": case_row.get("priority_score"),
            "incident_type": complaint.get("incident_type"),
            "location_general": complaint.get("location_general"),
            "location_detail": complaint.get("location_detail"),
            "accused_name": complaint.get("accused_name"),
            "routed_to": case_row.get("routed_to") or complaint.get("routed_to"),
            "escalated_to": case_row.get("escalated_to") or complaint.get("escalated_to"),
            "urgency": complaint.get("urgency"),
            "severity": complaint.get("severity"),
            "case_table_full_record": case_row,
        },
        "legal_chunks": [
            {
                "act_name": row.get("act_name"),
                "section_num": row.get("section_num"),
                "section_title": row.get("section_title"),
                "chunk_text": safe_text(row.get("chunk_text"))[:500],
            }
            for row in legal_chunks
        ],
    }


def answer_case_query(case_payload: dict[str, Any], user_query: str) -> str:
    if not groq_client:
        return "Case query is not configured: GROQ_API_KEY missing in .env"

    question = safe_text(user_query)
    if not question:
        return "Please send a valid question."

    legal_chunks = get_legal_chunks(question)
    context = build_query_context(case_payload, question, legal_chunks)

    completion = groq_client.chat.completions.create(
        model=GROQ_TEXT_MODEL,
        temperature=0.2,
        max_tokens=220,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a concise case assistant. Reply in <=4 lines. "
                    "Use only provided case context and legal chunks. "
                    "If uncertain, say: insufficient evidence available."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {question}\n\nContext JSON:\n{str(context)[:15000]}",
            },
        ],
    )

    response_text = safe_text(completion.choices[0].message.content if completion.choices else "")
    if not response_text:
        response_text = "I could not generate a response right now."

    if legal_chunks:
        first = legal_chunks[0]
        ref = f"Ref: {safe_text(first.get('act_name'))} {safe_text(first.get('section_num'))}".strip()
        return f"{response_text}\n{ref}"

    return f"{response_text}\nRef: No legal chunk matched."


def process_message(message: dict[str, Any]) -> None:
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = str(message.get("text") or "").strip()

    if not chat_id or not text:
        return

    lower = text.lower()

    if lower in ("/start", "/help"):
        send_message(chat_id, help_text())
        return

    if lower.startswith("/connect"):
        case_ref = text[8:].strip()
        if not case_ref:
            send_message(chat_id, "Usage: /connect <case_id_or_token>")
            return

        resolved = resolve_case(case_ref)
        if not resolved:
            send_message(chat_id, "Case not found. Check case id/token and try again.")
            return

        set_chat_case(str(chat_id), str(resolved.get("case_token") or resolved.get("case_id")))
        send_message(chat_id, f"Connected to case {resolved.get('case_token') or resolved.get('case_id')}. Use /status.")
        return

    if lower == "/status":
        linked = get_chat_case(str(chat_id))
        if not linked:
            send_message(chat_id, "No case linked. Use /connect <case_id_or_token> first.")
            return

        resolved = resolve_case(linked)
        if not resolved:
            send_message(chat_id, "Linked case not found. Reconnect using /connect.")
            return

        send_message(chat_id, format_status(resolved))
        return

    if text and not text.startswith("/"):
        linked = get_chat_case(str(chat_id))
        if not linked:
            send_message(chat_id, "No case linked. Use /connect <case_id_or_token> first.")
            return

        resolved = resolve_case(linked)
        if not resolved:
            send_message(chat_id, "Linked case not found. Reconnect using /connect.")
            return

        answer = answer_case_query(resolved, text)
        send_message(chat_id, answer)
        return

    send_message(chat_id, "Unknown command. Use /help")


def poll_updates_forever() -> None:
    logging.info("Telegram polling started")
    offset = None

    while True:
        try:
            payload = {"timeout": 20, "allowed_updates": ["message"]}
            if offset is not None:
                payload["offset"] = offset

            response = requests.get(f"{TELEGRAM_API_BASE}/getUpdates", params=payload, timeout=40)
            data = response.json()

            if not data.get("ok"):
                time.sleep(TELEGRAM_POLL_INTERVAL)
                continue

            updates = data.get("result") or []
            for update in updates:
                update_id = update.get("update_id")
                if isinstance(update_id, int):
                    offset = update_id + 1

                message = update.get("message")
                if message:
                    process_message(message)

        except Exception as exc:
            logging.exception("Polling loop error: %s", exc)
            time.sleep(max(TELEGRAM_POLL_INTERVAL, 1))


@app.get("/health")
def health() -> Any:
    return jsonify({"ok": True, "service": "telegram-status-bot", "mode": "local-polling"})


@app.get("/")
def home() -> Any:
    return jsonify(
        {
            "ok": True,
            "message": "Telegram status bot is running.",
            "commands": ["/connect <case_id_or_token>", "/status", "/help"],
        }
    )


def main() -> None:
    init_db()
    worker = threading.Thread(target=poll_updates_forever, daemon=True)
    worker.start()

    # Flask is optional operational visibility while polling runs locally.
    app.run(host="0.0.0.0", port=PORT, debug=False)


if __name__ == "__main__":
    main()
