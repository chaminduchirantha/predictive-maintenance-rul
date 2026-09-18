// Environment URL configuration: allows custom GCP backend or falls back to local backend
export const API_BASE_URL = 
  import.meta.env.VITE_API_URL 
    ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    : (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000');

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

  const response = await fetch(`${API_BASE_URL}/predict`, {
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

  const response = await fetch(`${API_BASE_URL}/batch-predict`, {
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

  const response = await fetch(`${API_BASE_URL}/feedback`, {
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
  const response = await fetch(`${API_BASE_URL}/retrain`, {
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

// 5. Get Service Health/Status Endpoint (/)
export async function getServiceStatus() {
  const response = await fetch(`${API_BASE_URL}/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch service status.');
  }

  return await response.json();
}

// 6. Get Model Metrics & Feature Importances Endpoint (/metrics)
export async function getModelMetrics() {
  const response = await fetch(`${API_BASE_URL}/metrics`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch model metrics.');
  }

  return await response.json();
}