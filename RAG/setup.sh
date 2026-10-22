#!/bin/bash

# JustRAG Setup Script for Hackathon

echo "🚀 JustRAG - Legal Knowledge Graph Setup"
echo "=========================================="
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies with uv..."
uv sync

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Step 2: Check Ollama
echo "🤖 Checking Ollama..."
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama not found. Please install from https://ollama.ai"
    exit 1
fi

echo "✅ Ollama found"
echo ""

# Step 3: Pull required models
echo "📥 Pulling required models..."
echo "  → Pulling nomic-embed-text (embedding model)..."
ollama pull nomic-embed-text

echo "  → Pulling qwen2.5:1.5b (LLM for entity extraction)..."
ollama pull qwen2.5:1.5b

echo "✅ Models ready"
echo ""

# Step 4: Environment check
echo "🔍 Checking environment variables..."
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo "Please create .env with your Supabase credentials"
    exit 1
fi

echo "✅ .env file exists"
echo ""

# Step 5: Database setup reminder
echo "📊 DATABASE SETUP REQUIRED:"
echo "==========================================="
echo "1. Open your Supabase dashboard"
echo "2. Go to SQL Editor"
echo "3. Copy and run sql/setup_pgvector.sql"
echo ""
echo "Press Enter when database setup is complete..."
read

# Step 6: Start the application
echo ""
echo "🎉 Setup complete! Starting web application..."
echo ""
echo "The app will be available at: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uv run python app.py
