export const API_BASE_URL = 'http://127.0.0.1:8000';

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
    throw new Error(errorData.detail?.[0]?.msg || 'Inference call failed.');
  }

  return await response.json();
}