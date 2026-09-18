"""
PredictaMaint REST API — Industrial Predictive Maintenance & Diagnostic Service
Powered by FastAPI, Scikit-Learn, and Gradient Boosting
"""

import os
import sys
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks, status, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import joblib

# Ensure workspace root is in python path so src modules import cleanly
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from src.preprocessing import prepare_inference_features
from src.diagnostics import evaluate_diagnostics

# Paths to serialized artifacts
MODELS_DIR = os.path.join(ROOT_DIR, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "machine_failure_model.pkl")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")
FEATURES_PATH = os.path.join(MODELS_DIR, "model_features.pkl")
FEEDBACK_CSV = os.path.join(ROOT_DIR, "data", "feedback_log.csv")

# Initialize FastAPI App
app = FastAPI(
    title="🛠️ PredictaMaint API",
    description="Industrial Machine Failure Prediction, Root-Cause Diagnostics & Prescriptive Maintenance API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for frontend integration (Streamlit, React, Vue, mobile apps)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
)

# Mount static frontend assets if built
FRONTEND_DIST = os.path.join(ROOT_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

# Global State Container for Model Artifacts
state: Dict[str, Any] = {
    "model": None,
    "scaler": None,
    "feature_columns": None,
    "loaded_at": None
}

def load_artifacts():
    """Loads or reloads serialized model artifacts into application memory."""
    if not (os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH) and os.path.exists(FEATURES_PATH)):
        raise FileNotFoundError(
            f"Model artifacts not found in {MODELS_DIR}. Ensure src/train.py has been executed."
        )
    state["model"] = joblib.load(MODEL_PATH)
    state["scaler"] = joblib.load(SCALER_PATH)
    state["feature_columns"] = joblib.load(FEATURES_PATH)
    state["loaded_at"] = datetime.utcnow().isoformat() + "Z"
    print(f"[{datetime.utcnow()}] Successfully loaded model artifacts from {MODELS_DIR}")

# Load artifacts on import if available
if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH) and os.path.exists(FEATURES_PATH):
    try:
        load_artifacts()
    except Exception as e:
        print(f"Warning: Initial artifact load deferred: {e}")

@app.on_event("startup")
def startup_event():
    if state["model"] is None:
        load_artifacts()


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class SensorInput(BaseModel):
    Type: str = Field(
        ...,
        description="Product quality variant: 'L' (Low 50%), 'M' (Medium 30%), or 'H' (High 20%)",
        example="M"
    )
    Air_temperature_K: float = Field(
        ...,
        description="Ambient air temperature in Kelvin (typically 295.0 to 305.0 K)",
        example=298.1
    )
    Process_temperature_K: float = Field(
        ...,
        description="Process operating temperature in Kelvin (typically 305.0 to 315.0 K)",
        example=308.6
    )
    Rotational_speed_rpm: float = Field(
        ...,
        description="Spindle rotational speed in RPM (typically 1100 to 2900 rpm)",
        example=1550.0
    )
    Torque_Nm: float = Field(
        ...,
        description="Spindle torque in Newton-meters (typically 3.0 to 80.0 Nm)",
        example=42.8
    )
    Tool_wear_min: float = Field(
        ...,
        description="Tool wear time elapsed in minutes (lifecycle limit ~200-240 min)",
        example=35.0
    )
    Machine_ID: Optional[str] = Field(
        default="MCH-001",
        description="Unique identifier for the machine or spindle unit",
        example="CNC-MILL-04"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "Type": "M",
                "Air_temperature_K": 298.1,
                "Process_temperature_K": 308.6,
                "Rotational_speed_rpm": 1550.0,
                "Torque_Nm": 42.8,
                "Tool_wear_min": 35.0,
                "Machine_ID": "CNC-MILL-04"
            }
        }


class PredictionResponse(BaseModel):
    machine_id: str
    status: str
    failure_probability: float
    risk_level: str
    risk_badge: str
    diagnosed_failure_mode: str
    root_causes: List[str]
    recommended_actions: List[str]
    telemetry_summary: Dict[str, Any]
    timestamp: str


class BatchPredictionRequest(BaseModel):
    items: List[SensorInput]


class FeedbackInput(BaseModel):
    machine_id: str = Field(..., example="CNC-MILL-04")
    predicted_status: str = Field(..., example="Failure Likely")
    actual_failure: int = Field(..., ge=0, le=1, description="1 if machine actually failed, 0 if healthy", example=1)
    actual_failure_mode: Optional[str] = Field(default=None, example="Tool Wear Failure (TWF)")
    technician_notes: Optional[str] = Field(default=None, example="Cutting tool chipped on 230 min cycle")


# ==============================================================================
# Helper Prediction Function
# ==============================================================================

def execute_inference(item: SensorInput) -> PredictionResponse:
    # Validate product type
    p_type = item.Type.strip().upper()
    if p_type not in ["L", "M", "H"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid Product Type '{item.Type}'. Must be 'L', 'M', or 'H'."
        )

    # Convert to DataFrame matching original dataset column names
    raw_df = pd.DataFrame([{
        'Type': p_type,
        'Air temperature [K]': float(item.Air_temperature_K),
        'Process temperature [K]': float(item.Process_temperature_K),
        'Rotational speed [rpm]': float(item.Rotational_speed_rpm),
        'Torque [Nm]': float(item.Torque_Nm),
        'Tool wear [min]': float(item.Tool_wear_min)
    }])

    # Preprocess & align features
    df_aligned = prepare_inference_features(raw_df, state["feature_columns"])
    X_scaled = state["scaler"].transform(df_aligned)

    # Inference
    pred_binary = int(state["model"].predict(X_scaled)[0])
    prob_failure = float(state["model"].predict_proba(X_scaled)[0][1])

    # Run physics-based diagnostics
    diag = evaluate_diagnostics(
        product_type=p_type,
        air_temp=float(item.Air_temperature_K),
        proc_temp=float(item.Process_temperature_K),
        speed=float(item.Rotational_speed_rpm),
        torque=float(item.Torque_Nm),
        tool_wear=float(item.Tool_wear_min),
        prob_failure=prob_failure,
        pred_binary=pred_binary
    )

    return PredictionResponse(
        machine_id=item.Machine_ID or "MCH-001",
        status=diag["status"],
        failure_probability=diag["failure_probability"],
        risk_level=diag["risk_level"],
        risk_badge=diag["risk_badge"],
        diagnosed_failure_mode=diag["diagnosed_failure_mode"],
        root_causes=diag["root_causes"],
        recommended_actions=diag["recommended_actions"],
        telemetry_summary=diag["telemetry_summary"],
        timestamp=datetime.utcnow().isoformat() + "Z"
    )


# ==============================================================================
# API Endpoints
# ==============================================================================

@app.get("/", tags=["System"])
@app.get("/health", tags=["System"])
def root(request: Request):
    """Health check endpoint providing API metadata and active model status."""
    accept_header = request.headers.get("accept", "")
    index_html = os.path.join(FRONTEND_DIST, "index.html")
    if "text/html" in accept_header and os.path.exists(index_html) and request.url.path == "/":
        return FileResponse(index_html)
    return {
        "service": "PredictaMaint Predictive Maintenance REST API",
        "status": "operational",
        "version": "1.0.0",
        "model_architecture": type(state["model"]).__name__ if state["model"] else "Not Loaded",
        "feature_count": len(state["feature_columns"]) if state["feature_columns"] else 0,
        "loaded_at": state["loaded_at"],
        "docs_url": "/docs"
    }


@app.get("/app", include_in_schema=False)
def serve_ui():
    """Serves the single-page application UI."""
    index_html = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_html):
        return FileResponse(index_html)
    raise HTTPException(status_code=404, detail="Frontend build not found.")


@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
def predict(data: SensorInput):
    """
    Real-time single machine failure prediction and root-cause diagnostic assessment.
    """
    return execute_inference(data)


@app.post("/batch-predict", response_model=List[PredictionResponse], tags=["Inference"])
def batch_predict(batch: BatchPredictionRequest):
    """
    Batch prediction endpoint for multi-sensor or fleet machine telemetry arrays.
    """
    if not batch.items:
        raise HTTPException(status_code=400, detail="Batch request cannot be empty.")
    return [execute_inference(item) for item in batch.items]


@app.post("/feedback", tags=["Active Learning"])
def record_feedback(feedback: FeedbackInput):
    """
    Logs verified ground-truth maintenance results from plant technicians
    to support periodic continuous model retraining.
    """
    os.makedirs(os.path.dirname(FEEDBACK_CSV), exist_ok=True)
    
    new_record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "machine_id": feedback.machine_id,
        "predicted_status": feedback.predicted_status,
        "actual_failure": feedback.actual_failure,
        "actual_failure_mode": feedback.actual_failure_mode or "None",
        "technician_notes": feedback.technician_notes or ""
    }
    
    df_new = pd.DataFrame([new_record])
    if not os.path.exists(FEEDBACK_CSV):
        df_new.to_csv(FEEDBACK_CSV, index=False)
    else:
        df_new.to_csv(FEEDBACK_CSV, mode='a', header=False, index=False)
        
    return {
        "message": "Technician feedback logged successfully for retraining pipeline.",
        "record": new_record
    }


def background_retraining_task():
    """Worker task that executes retraining pipeline and hot-reloads model artifacts."""
    from src.train import run_training_pipeline
    try:
        print(f"[{datetime.utcnow()}] Background retraining initiated...")
        run_training_pipeline(models_dir=MODELS_DIR, optimize_hyperparams=False)
        load_artifacts()
        print(f"[{datetime.utcnow()}] Background retraining complete. New artifacts hot-reloaded.")
    except Exception as e:
        print(f"[{datetime.utcnow()}] Retraining failed with error: {str(e)}")


@app.post("/retrain", tags=["Model Lifecycle"])
def trigger_retraining(background_tasks: BackgroundTasks):
    """
    Asynchronously triggers the model retraining pipeline in the background
    and atomically hot-reloads new model artifacts without API downtime.
    """
    background_tasks.add_task(background_retraining_task)
    return {
        "message": "Retraining job queued in background.",
        "status": "in_progress",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@app.get("/metrics", tags=["Model Lifecycle"])
def get_model_metrics():
    """Returns active model feature names and feature importances."""
    if not state["model"] or not state["feature_columns"]:
        raise HTTPException(status_code=500, detail="Model is not loaded.")
        
    importances = {}
    if hasattr(state["model"], "feature_importances_"):
        importances = {
            col: round(float(imp), 4)
            for col, imp in zip(state["feature_columns"], state["model"].feature_importances_)
        }
        # Sort descending
        importances = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))

    return {
        "model_type": type(state["model"]).__name__,
        "model_parameters": state["model"].get_params(),
        "feature_count": len(state["feature_columns"]),
        "features": state["feature_columns"],
        "feature_importances": importances
    }
