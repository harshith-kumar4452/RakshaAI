@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo   JustRAG - Legal Knowledge Graph Setup
echo ===============================================
echo.

REM Step 1: Install dependencies
echo [1/5] Installing dependencies with uv...
call uv sync
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo DONE: Dependencies installed
echo.

REM Step 2: Check Ollama
echo [2/5] Checking Ollama...
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Ollama not found. Please install from https://ollama.ai
    pause
    exit /b 1
)
echo DONE: Ollama found
echo.

REM Step 3: Pull required models
echo [3/5] Pulling required models...
echo   - Pulling nomic-embed-text (embedding model)...
call ollama pull nomic-embed-text
echo   - Pulling qwen2.5:1.5b (LLM for entity extraction)...
call ollama pull qwen2.5:1.5b
echo DONE: Models ready
echo.

REM Step 4: Environment check
echo [4/5] Checking environment variables...
if not exist ".env" (
    echo ERROR: .env file not found
    echo Please create .env with your Supabase credentials
    pause
    exit /b 1
)
echo DONE: .env file exists
echo.

REM Step 5: Database setup reminder
echo [5/5] DATABASE SETUP REQUIRED:
echo ===============================================
echo 1. Open your Supabase dashboard
echo 2. Go to SQL Editor
echo 3. Copy and run sql/setup_pgvector.sql
echo.
echo Press any key when database setup is complete...
pause >nul
echo.

REM Step 6: Start the application
echo.
echo ===============================================
echo   Setup complete! Starting web application...
echo ===============================================
echo.
echo The app will be available at: http://localhost:5000
echo.
echo Press Ctrl+C to stop the server
echo.

call uv run python app.py
