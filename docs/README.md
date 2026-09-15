# PredictaMaint Project Documentation

This directory contains technical architecture documentation, API guides for frontend developers, and deployment resources.

---

## Documentation Index

1. **[Backend API Integration Guide for Frontend Developers](API_DOCUMENTATION.md)**
   - Complete endpoint catalog (`/`, `/predict`, `/batch-predict`, `/feedback`, `/retrain`, `/metrics`)
   - Sensor input data dictionary (valid ranges, units, step sizes, defaults)
   - Response structures (probability, risk levels, root-cause diagnostics, prescriptive actions)
   - Code snippets for Streamlit and JavaScript/React integrations

2. **Application Architecture & Full-Stack Deployment**
   - **Frontend**: Streamlit UI (`frontend/app.py`)
   - **Backend**: FastAPI REST Service (`backend/main.py`)
   - **ML Core**: Feature engineering pipeline (`src/preprocessing.py`) and diagnostics (`src/diagnostics.py`)
   - **Containerization**: `Dockerfile` for Google Cloud Run / GCP

3. **Screenshots & Assets**
   - [`screenshots/`](screenshots/): UI captures, ROC curves, confusion matrices, and feature importance charts.
