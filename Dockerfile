FROM python:3.11-slim-bookworm

# 1. Install Node.js 20, system libraries for OpenCV, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    libgl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Install Python AI dependencies
COPY apps/ai-service/requirements.txt ./apps/ai-service/
RUN pip install --no-cache-dir -r apps/ai-service/requirements.txt

# 3. Install Node.js monorepo dependencies
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
RUN npm install

# 4. Copy full project source and models
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY models/ ./models/
COPY scripts/ ./scripts/
COPY tsconfig*.json ./
COPY start.sh ./
RUN chmod +x start.sh

# 5. Ensure AI models are present (auto-downloads if missing from Git)
RUN python scripts/download_models.py

# 6. Generate Prisma client & Build Web Frontend + Node.js API
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma || true
RUN npm run build:web
RUN npm run build:api

# Ensure runtime directories exist
RUN mkdir -p /app/data /app/uploads

# Default production environment
ENV NODE_ENV=production
ENV PORT=5000
ENV MODELS_DIR=/app/models
ENV AI_SERVICE_URL=http://127.0.0.1:8000

EXPOSE 5000

CMD ["/bin/bash", "/app/start.sh"]
