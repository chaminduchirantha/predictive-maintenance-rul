// Environment URL configuration
export const API_BASE_URL = 'http://127.0.0.1:8000';

// 1. Single Machine Prediction Endpoint (/predict)
export async function predictMachineHealth(formData) {
  const payload = {
    Type: formData.Type,
    Air_temperature_K: parseFloat(formData.Air_temperature_K),
    Process_temperature_K: parseFloat(formData.Process_temperature_K),
    Rotational_speed_rpm: parseFloat(formData.Rotational_speed_rpm),
    Torque_Nm: parseFloat(formData.Torque_Nm),
    Tool_wear_min: parseFloat(formData.Tool_wear_min),
    Machine_ID: formData.Machine_ID || 'CNC-MILL-01'
  };

  const response = await fetch(`${API_BASE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail?.[0]?.msg || 'Single prediction failed.');
  }

  return await response.json();
}

// 2. Batch Machine Prediction Endpoint (/batch-predict)
export async function predictBatchMachineHealth(itemsArray) {
  const payload = {
    items: itemsArray.map(item => ({
      Type: item.Type,
      Air_temperature_K: parseFloat(item.Air_temperature_K),
      Process_temperature_K: parseFloat(item.Process_temperature_K),
      Rotational_speed_rpm: parseFloat(item.Rotational_speed_rpm),
      Torque_Nm: parseFloat(item.Torque_Nm),
      Tool_wear_min: parseFloat(item.Tool_wear_min),
      Machine_ID: item.Machine_ID || 'CNC-MILL-01'
    }))
  };

  const response = await fetch(`${API_BASE_URL}/batch-predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Batch prediction failed.');
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
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Submitting feedback failed.');
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
    const errorData = await response.json();
    throw new Error(errorData.detail || 'Triggering retraining failed.');
  }

  return await response.json();

  
}

// Add these functions to your api.js file

// 5. Get Service Health/Status Endpoint (/health or /status)
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