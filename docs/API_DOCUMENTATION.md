# PredictaMaint — Backend API Integration Guide for Frontend Developers

Welcome to the **PredictaMaint API Documentation**. This guide covers everything frontend developers (Streamlit, React, Vue, Next.js, or mobile) need to know to integrate machine failure predictions, real-time diagnostics, and maintenance workflows.

---

## 1. Quick Start & Server Endpoints

| Environment | Base URL | Interactive Swagger Docs | ReDoc |
|---|---|---|---|
| **Local Development** | `http://127.0.0.1:8000` | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) |
| **GCP Cloud Run (Production)** | `https://predictamaint-backend-xyz.a.run.app` | `/docs` | `/redoc` |

### Key Protocols
- **CORS**: Enabled for all origins (`*`) by default.
- **Request Format**: `Content-Type: application/json`.
- **Response Format**: `application/json; charset=utf-8`.

---

## 2. Input Telemetry Data Dictionary (Form Fields & UI Constraints)

Use this table to set up input fields, validation rules, sliders, and default values in your UI:

| Field Name | Type | UI Component | Allowed Range | Step | Default Value | Description / Sensor Unit |
|---|---|---|---|---|---|---|
| **`Type`** | `string` | Dropdown / Select | `["L", "M", "H"]` | — | `"M"` | Product quality tier: **L** (Low 50%), **M** (Medium 30%), **H** (High 20%). |
| **`Air_temperature_K`** | `float` | Number Input / Slider | `295.0` to `305.0` | `0.1` | `298.1` | Ambient air temperature in Kelvin ($K$). ($298.15\text{ K} \approx 25^\circ\text{C}$). |
| **`Process_temperature_K`** | `float` | Number Input / Slider | `305.0` to `315.0` | `0.1` | `308.6` | Internal operating temperature in Kelvin ($K$). Typically higher than Air temp. |
| **`Rotational_speed_rpm`** | `float` | Number Input / Slider | `1100` to `2900` | `10` | `1550.0` | Spindle rotational speed in Revolutions Per Minute (RPM). |
| **`Torque_Nm`** | `float` | Number Input / Slider | `3.0` to `85.0` | `0.5` | `42.8` | Spindle torque in Newton-meters ($Nm$). High torque indicates heavy mechanical load. |
| **`Tool_wear_min`** | `float` | Number Input / Slider | `0` to `260` | `1` | `35.0` | Accumulated cutting tool wear in minutes ($min$). **Critical threshold is 200 min**. |
| **`Machine_ID`** | `string` | Text Input *(Optional)* | Any string | — | `"CNC-MILL-01"` | Identifier for machine or factory line. |

---

## 3. Endpoints Specification

### 3.1 `GET /` — System Health & Metadata
Verifies server health, loaded model architecture, and feature counts.

- **Method**: `GET`
- **Path**: `/`
- **Response Example (`200 OK`)**:
```json
{
  "service": "PredictaMaint Predictive Maintenance REST API",
  "status": "operational",
  "version": "1.0.0",
  "model_architecture": "GradientBoostingClassifier",
  "feature_count": 12,
  "loaded_at": "2026-09-15T16:04:48.667486Z",
  "docs_url": "/docs"
}
```

---

### 3.2 `POST /predict` — Real-Time Machine Prediction & Diagnostics
The core inference endpoint. Takes live sensor readings and returns probability, risk level, diagnosed failure mode, root-cause bullet points, and prescriptive technician actions.

- **Method**: `POST`
- **Path**: `/predict`

#### Request Payload
```json
{
  "Type": "L",
  "Air_temperature_K": 304.5,
  "Process_temperature_K": 313.8,
  "Rotational_speed_rpm": 1200.0,
  "Torque_Nm": 68.5,
  "Tool_wear_min": 225.0,
  "Machine_ID": "CNC-SPINDLE-04"
}
```

#### Response Payload (`200 OK`)
```json
{
  "machine_id": "CNC-SPINDLE-04",
  "status": "Failure Likely",
  "failure_probability": 0.9997,
  "risk_level": "CRITICAL (Immediate Action)",
  "risk_badge": "🔴",
  "diagnosed_failure_mode": "Tool Wear Failure (TWF) + Overstrain Failure (OSF)",
  "root_causes": [
    "Tool wear critical (225 min >= 200 min lifecycle threshold)",
    "Cumulative overstrain fatigue (15412 min·Nm > 11000 min·Nm threshold for Type L)"
  ],
  "recommended_actions": [
    "Halt spindle; replace cutting tool insert immediately and reset tool wear counter.",
    "Reduce feed rate and cutting depth; inspect workpiece clamping rigidity and toolholder seat."
  ],
  "telemetry_summary": {
    "type": "L",
    "air_temperature_k": 304.5,
    "process_temperature_k": 313.8,
    "temp_diff_k": 9.3,
    "rotational_speed_rpm": 1200.0,
    "torque_nm": 68.5,
    "power_kw": 8.61,
    "tool_wear_min": 225.0,
    "overstrain_min_nm": 15412.5
  },
  "timestamp": "2026-09-15T16:04:49.123456Z"
}
```

#### UI Mapping Suggestions for Frontend Devs
- **Status Banner**: Color background green if `status == "Normal"` and red if `status == "Failure Likely"`.
- **Gauge / Progress Bar**: Bind to `failure_probability * 100` (e.g. `99.97%`).
- **Risk Badge (`risk_badge`)**: Render `🟢` for Low, `🟡` for Moderate, `🟠` for Elevated, and `🔴` for Critical.
- **Root Causes**: Render `root_causes` array as a bulleted list under an **"Anomaly Diagnosis"** card.
- **Recommended Actions**: Render `recommended_actions` as a highlighted alert box with warning styling.
- **Calculated Metrics**: Display `telemetry_summary.temp_diff_k`, `power_kw`, and `overstrain_min_nm` in a secondary telemetry metric chip/table.

---

### 3.3 `POST /batch-predict` — Fleet / Multi-Machine Batch Inference
Predicts on an array of machines simultaneously. Useful for fleet telemetry dashboards and CSV upload previews.

- **Method**: `POST`
- **Path**: `/batch-predict`

#### Request Payload
```json
{
  "items": [
    {
      "Type": "M",
      "Air_temperature_K": 298.1,
      "Process_temperature_K": 308.6,
      "Rotational_speed_rpm": 1550.0,
      "Torque_Nm": 42.8,
      "Tool_wear_min": 35.0,
      "Machine_ID": "MCH-01"
    },
    {
      "Type": "L",
      "Air_temperature_K": 303.2,
      "Process_temperature_K": 308.4,
      "Rotational_speed_rpm": 1310.0,
      "Torque_Nm": 45.0,
      "Tool_wear_min": 85.0,
      "Machine_ID": "MCH-02"
    }
  ]
}
```

#### Response Payload (`200 OK`)
Returns a JSON Array of `PredictionResponse` objects matching the `/predict` structure:
```json
[
  {
    "machine_id": "MCH-01",
    "status": "Normal",
    "failure_probability": 0.0029,
    "risk_level": "LOW (Nominal)",
    "risk_badge": "🟢",
    "diagnosed_failure_mode": "None (Operating Nominally)",
    "root_causes": ["All sensor telemetry operating within safe physical boundaries."],
    "recommended_actions": ["No maintenance required. Continue standard operational run."],
    "telemetry_summary": { ... },
    "timestamp": "2026-09-15T16:04:49.200000Z"
  },
  {
    "machine_id": "MCH-02",
    "status": "Failure Likely",
    "failure_probability": 0.8842,
    "risk_level": "CRITICAL (Immediate Action)",
    "risk_badge": "🔴",
    "diagnosed_failure_mode": "Heat Dissipation Failure (HDF)",
    "root_causes": ["Thermal dissipation deficit (ΔT = 5.2 K < 8.6 K) coupled with low cooling airflow (1310 rpm < 1380 rpm)"],
    "recommended_actions": ["Inspect and flush coolant channels, clean radiator fins, and ensure environmental ventilation."],
    "telemetry_summary": { ... },
    "timestamp": "2026-09-15T16:04:49.200000Z"
  }
]
```

---

### 3.4 `POST /feedback` — Active Learning & Technician Feedback Logging
Enables plant technicians to verify whether a machine actually failed. Logs data into `data/feedback_log.csv` for continuous retraining.

- **Method**: `POST`
- **Path**: `/feedback`

#### Request Payload
```json
{
  "machine_id": "CNC-SPINDLE-04",
  "predicted_status": "Failure Likely",
  "actual_failure": 1,
  "actual_failure_mode": "Tool Wear Failure (TWF)",
  "technician_notes": "Carbide tip chipped at 225 min during steel milling operation."
}
```

#### Response Payload (`200 OK`)
```json
{
  "message": "Technician feedback logged successfully for retraining pipeline.",
  "record": {
    "timestamp": "2026-09-15T16:04:49.300000Z",
    "machine_id": "CNC-SPINDLE-04",
    "predicted_status": "Failure Likely",
    "actual_failure": 1,
    "actual_failure_mode": "Tool Wear Failure (TWF)",
    "technician_notes": "Carbide tip chipped at 225 min during steel milling operation."
  }
}
```

---

### 3.5 `POST /retrain` — Asynchronous Model Retraining Trigger
Triggers model retraining in the background without causing API downtime.

- **Method**: `POST`
- **Path**: `/retrain`
- **Request Body**: None
- **Response Example (`200 OK`)**:
```json
{
  "message": "Retraining job queued in background.",
  "status": "in_progress",
  "timestamp": "2026-09-15T16:04:49.400000Z"
}
```

---

### 3.6 `GET /metrics` — Feature Importances & Model Analytics
Provides global model statistics and feature importances for plotting in frontend dashboard charts.

- **Method**: `GET`
- **Path**: `/metrics`
- **Response Example (`200 OK`)**:
```json
{
  "model_type": "GradientBoostingClassifier",
  "model_parameters": {
    "learning_rate": 0.1,
    "max_depth": 3,
    "n_estimators": 100,
    "random_state": 42
  },
  "feature_count": 12,
  "features": [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Temp_Diff",
    "Power_kW",
    "Wear_x_Torque",
    "Type_L",
    "Type_M",
    "Wear_Level_Medium",
    "Wear_Level_High"
  ],
  "feature_importances": {
    "Rotational speed [rpm]": 0.3238,
    "Power_kW": 0.2893,
    "Tool wear [min]": 0.1564,
    "Torque [Nm]": 0.1121,
    "Wear_x_Torque": 0.0543,
    "Air temperature [K]": 0.0312,
    "Process temperature [K]": 0.0189,
    "Temp_Diff": 0.0112,
    "Type_L": 0.0018,
    "Type_M": 0.0006,
    "Wear_Level_High": 0.0004,
    "Wear_Level_Medium": 0.0
  }
}
```

---

## 4. Error Handling & HTTP Status Codes

| Status Code | Reason | What to Display in UI |
|---|---|---|
| **`200 OK`** | Request succeeded. | Render normal dashboard / results. |
| **`422 Unprocessable Entity`** | Field validation error (e.g. `Type` not 'L', 'M', 'H' or string passed to a float field). | Display inline form field error message. |
| **`400 Bad Request`** | Logical payload error (e.g. empty batch array). | Alert: *"Please enter at least one machine record."* |
| **`500 Internal Error`** | Server / model artifact loading error. | Alert: *"Backend service error. Please contact administrator."* |

---

## 5. Frontend Code Examples

### Streamlit (Python) Integration
```python
import streamlit as st
import requests

API_URL = "http://127.0.0.1:8000/predict"

payload = {
    "Type": st.selectbox("Product Type", ["L", "M", "H"], index=1),
    "Air_temperature_K": st.number_input("Air Temp [K]", 295.0, 305.0, 298.1),
    "Process_temperature_K": st.number_input("Process Temp [K]", 305.0, 315.0, 308.6),
    "Rotational_speed_rpm": st.number_input("Rotational Speed [rpm]", 1100.0, 2900.0, 1550.0),
    "Torque_Nm": st.number_input("Torque [Nm]", 3.0, 85.0, 42.8),
    "Tool_wear_min": st.number_input("Tool Wear [min]", 0.0, 260.0, 35.0),
    "Machine_ID": "CNC-01"
}

if st.button("Analyze Machine Telemetry"):
    res = requests.post(API_URL, json=payload).json()
    
    if res["status"] == "Failure Likely":
        st.error(f"{res['risk_badge']} **{res['status']}** — {res['failure_probability'] * 100:.2f}% Risk")
        st.warning(f"**Diagnosed Mode:** {res['diagnosed_failure_mode']}")
        st.write("### Recommended Action:")
        for action in res["recommended_actions"]:
            st.info(f"👉 {action}")
    else:
        st.success(f"{res['risk_badge']} **{res['status']}** — Machine operating normally ({res['failure_probability'] * 100:.2f}%)")
```

### JavaScript / TypeScript (`fetch`) Integration
```javascript
const API_URL = "http://127.0.0.1:8000/predict";

async function checkMachine(sensorData) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sensorData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Prediction Result:", data);
    return data;
  } catch (error) {
    console.error("Inference request failed:", error);
  }
}
```
