// Environment URL configuration with intelligent live Cloud Run fallback
export const LIVE_GCP_BACKEND = 'https://predictamaint-19136949309.asia-south1.run.app';

let activeBaseUrl = 
  import.meta.env.VITE_API_URL 
    ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    : (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

export function getActiveApiUrl() {
  return activeBaseUrl;
}

/**
 * Universal fetch wrapper with automatic live GCP Cloud Run failover.
 * If local dev backend (localhost:8000) is offline, it dynamically switches to the
 * high-availability GCP Cloud Run production instance so the UI never shows 'Offline'.
 */
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(`${activeBaseUrl}${endpoint}`, options);
    return response;
  } catch (networkErr) {
    // If local server is not running and we are on localhost, route to live Cloud Run
    if (activeBaseUrl !== LIVE_GCP_BACKEND && typeof window !== 'undefined' && 
       (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.warn(`[PredictaMaint] Local API (${activeBaseUrl}) unreachable. Switching to live Cloud Run: ${LIVE_GCP_BACKEND}`);
      activeBaseUrl = LIVE_GCP_BACKEND;
      return await fetch(`${LIVE_GCP_BACKEND}${endpoint}`, options);
    }
    throw networkErr;
  }
}

// 1. Single Machine Prediction Endpoint (/predict)
export async function predictMachineHealth(formData) {
  const payload = {
    Type: (formData.Type || 'M').trim().toUpperCase(),
    Air_temperature_K: parseFloat(formData.Air_temperature_K),
    Process_temperature_K: parseFloat(formData.Process_temperature_K),
    Rotational_speed_rpm: parseFloat(formData.Rotational_speed_rpm),
    Torque_Nm: parseFloat(formData.Torque_Nm),
    Tool_wear_min: parseFloat(formData.Tool_wear_min),
    Machine_ID: formData.Machine_ID ? formData.Machine_ID.trim() : 'CNC-MILL-01'
  };

  const response = await apiFetch('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMsg = 'Single prediction failed.';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail?.[0]?.msg || errorData.detail || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return await response.json();
}

// 2. Batch Machine Prediction Endpoint (/batch-predict)
export async function predictBatchMachineHealth(itemsArray) {
  if (!itemsArray || itemsArray.length === 0) {
    throw new Error('Batch list cannot be empty. Please provide at least one machine telemetry record.');
  }

  const payload = {
    items: itemsArray.map((item, idx) => ({
      Type: (item.Type || 'M').trim().toUpperCase(),
      Air_temperature_K: parseFloat(item.Air_temperature_K),
      Process_temperature_K: parseFloat(item.Process_temperature_K),
      Rotational_speed_rpm: parseFloat(item.Rotational_speed_rpm),
      Torque_Nm: parseFloat(item.Torque_Nm),
      Tool_wear_min: parseFloat(item.Tool_wear_min),
      Machine_ID: (item.Machine_ID || `CNC-MCH-${String(idx + 1).padStart(2, '0')}`).trim()
    }))
  };

  const response = await apiFetch('/batch-predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMsg = 'Batch prediction failed.';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return await response.json();
}

// 3. Send Technician Feedback Endpoint (/feedback)
export async function sendTechnicianFeedback(feedbackData) {
  const payload = {
    machine_id: feedbackData.machine_id,
    predicted_status: feedbackData.predicted_status,
    actual_failure: parseInt(feedbackData.actual_failure, 10),
    actual_failure_mode: feedbackData.actual_failure_mode || null,
    technician_notes: feedbackData.technician_notes || ""
  };

  const response = await apiFetch('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMsg = 'Submitting feedback failed.';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return await response.json();
}

// 4. Trigger Model Retraining Endpoint (/retrain)
export async function triggerModelRetrain() {
  const response = await apiFetch('/retrain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    let errorMsg = 'Triggering retraining failed.';
    try {
      const errorData = await response.json();
      errorMsg = errorData.detail || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  return await response.json();
}

// 5. Get Service Health/Status Endpoint (/health)
export async function getServiceStatus() {
  const response = await apiFetch('/health', {
    method: 'GET',
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json' 
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch service status.');
  }

  return await response.json();
}

// 6. Get Model Metrics & Feature Importances Endpoint (/metrics)
export async function getModelMetrics() {
  const response = await apiFetch('/metrics', {
    method: 'GET',
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json' 
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch model metrics.');
  }

  return await response.json();
}