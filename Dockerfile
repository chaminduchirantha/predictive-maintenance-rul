# ==============================================================================
# PredictaMaint Backend Dockerfile for Google Cloud Run / GCP Deployment
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy application source code and models
COPY src/ /app/src/
COPY backend/ /app/backend/
COPY models/ /app/models/
COPY data/ /app/data/

# Expose port (Cloud Run sets $PORT dynamically)
EXPOSE 8000

# Run uvicorn server binding dynamically to $PORT
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}
