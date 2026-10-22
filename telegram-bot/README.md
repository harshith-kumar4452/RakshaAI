# Telegram Status Bot (Python + Flask)

Local polling Telegram bot for Justra case status.

## Features

- Python bot using Flask
- Local polling mode via Telegram `getUpdates` (no webhook)
- Case linking by case id/token only
- Commands:
  - `/connect <case_id_or_token>`
  - `/status`
  - `/help`
- Any plain text (without `/`) runs a brief query answer using case context + legal chunks
- Reads status from Supabase tables: `cases`, `complaints`, `case_status_workflow`
- Uses Groq for concise responses to plain-text queries

## Setup with UV (venv)

From `telegram-bot/`:

```powershell
uv venv
.\.venv\Scripts\Activate.ps1
uv pip install -r requirements.txt
```

Copy env template and fill values:

```powershell
Copy-Item .env.example .env
```

Required env values:

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`

Optional:

- `TELEGRAM_POLL_INTERVAL` (default `2` seconds)
- `PORT` (default `8000`)
- `GROQ_TEXT_MODEL` (default `llama-3.3-70b-versatile`)

## Run locally

```powershell
python app.py
```

Bot starts polling Telegram messages and exposes local health endpoint:

- `http://localhost:8000/health`

## Notes

- No webhook is used.
- No OTP/phone linking; case id/token only.
- Chat-to-case link is stored locally in `chat_links.db`.
- Queries without slash use linked case details from `cases` table plus legal chunk retrieval.
