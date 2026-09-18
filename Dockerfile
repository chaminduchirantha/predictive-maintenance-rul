# ==============================================================================
# PredictaMaint Unified Multi-Stage Dockerfile for Google Cloud Run / GCP GCE
# Serves both the React Single-Page Application & FastAPI REST API
# ==============================================================================

# Stage 1: Build the React/Vite Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit || npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Runtime
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy ML pipeline, models, and data
COPY src/ /app/src/
COPY backend/ /app/backend/
COPY models/ /app/models/
COPY data/ /app/data/

# Copy built frontend assets from Stage 1 into the container
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Expose standard web port
EXPOSE 8000

# Run uvicorn server binding dynamically to $PORT (Cloud Run injects $PORT)
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}
