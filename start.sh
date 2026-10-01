#!/bin/bash
set -e

echo "=================================================="
echo "✨ Starting WedSnap Production Suite on Railway"
echo "=================================================="

# 1. Start Python AI Microservice (ArcFace 512D + YuNet) on background port 8000
echo "🚀 [1/2] Launching Python AI Microservice on internal port 8000..."
export PYTHONUNBUFFERED=1
export MODELS_DIR=/app/models
cd /app/apps/ai-service
python main.py &
AI_PID=$!

# Brief pause to ensure AI microservice is ready
sleep 3
cd /app

# Optional: if PostgreSQL is connected, automatically push database schema
if [ -n "$DATABASE_URL" ]; then
  echo "📦 PostgreSQL Database URL detected. Auto-syncing Prisma schema..."
  npx prisma db push --schema=/app/apps/api/prisma/schema.prisma --accept-data-loss || true
fi

# 2. Start Node.js API Server & Web Frontend on $PORT
export PORT="${PORT:-5000}"
export AI_SERVICE_URL="http://127.0.0.1:8000"
echo "🌐 [2/2] Launching Node.js Full-Stack Server on port ${PORT}..."
exec node apps/api/dist/index.js
