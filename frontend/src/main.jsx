import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_BASE_URL = 'http://127.0.0.1:8000'

const initialForm = {
  Type: 'M',
  Air_temperature_K: '298.1',
  Process_temperature_K: '308.6',
  Rotational_speed_rpm: '1550',
  Torque_Nm: '42.8',
  Tool_wear_min: '35',
  Machine_ID: 'CNC-MILL-01'
}

const fields = [
  ['Air_temperature_K', 'Air temperature', 'K', 'Ambient temperature around the machine'],
  ['Process_temperature_K', 'Process temperature', 'K', 'Temperature during operation'],
  ['Rotational_speed_rpm', 'Rotational speed', 'rpm', 'Current spindle speed'],
  ['Torque_Nm', 'Torque', 'Nm', 'Applied cutting torque'],
  ['Tool_wear_min', 'Tool wear', 'min', 'Minutes since tool replacement'],
]

function App() {
  const [form, setForm] = useState(initialForm)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      Type: form.Type,
      Air_temperature_K: parseFloat(form.Air_temperature_K),
      Process_temperature_K: parseFloat(form.Process_temperature_K),
      Rotational_speed_rpm: parseFloat(form.Rotational_speed_rpm),
      Torque_Nm: parseFloat(form.Torque_Nm),
      Tool_wear_min: parseFloat(form.Tool_wear_min),
      Machine_ID: form.Machine_ID || 'CNC-MILL-01'
    }

    try {
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail?.[0]?.msg || 'Inference call failed.')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message || 'Unable to connect to prediction server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">PM</div>
        <div><p className="eyebrow">Predictive maintenance</p><h1>PredictaMaint</h1></div>
        <div className="model-status"><span /> ML Service Connected</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow accent">Machine health assessment</p>
          <h2>Spot the warning signs<br /><em>before</em> downtime.</h2>
          <p className="intro-copy">Enter the operating conditions below to estimate failure risk from the AI4I 2020 machine diagnostics model.</p>
        </div>
        <div className="intro-stat"><strong>GradientBoosting</strong><span>Active Classifier</span></div>
      </section>

      <div className="workspace">
        <form className="diagnostic-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <div>
              <p className="eyebrow">01 / Machine profile</p>
              <h3>Operating conditions</h3>
            </div>
            <span className="required">All fields required</span>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="field-grid">
            <label className="field type-field">
              Product type 
              <span className="field-help">Category used during training</span>
              <select name="Type" value={form.Type} onChange={updateField}>
                <option value="L">L / Light</option>
                <option value="M">M / Medium</option>
                <option value="H">H / Heavy</option>
              </select>
            </label>

            {fields.map(([name, label, unit, help]) => (
              <label className="field" key={name}>
                {label}
                <span className="field-help">{help}</span>
                <div className="input-wrap">
                  <input required name={name} type="number" step="any" value={form[name]} onChange={updateField} />
                  <span>{unit}</span>
                </div>
              </label>
            ))}
          </div>

          <button className="predict-button" type="submit" disabled={loading}>
            {loading ? 'Running Diagnostics...' : 'Run health prediction'} <span>{'->'}</span>
          </button>
        </form>

        <aside className="side-note">
          <span className="note-number">02</span>
          <h3>Live API Integration</h3>
          <p>This form dispatches sensor telemetry directly to the FastAPI REST service for real-time model scoring and root-cause diagnostics.</p>
          <div className="signal-line"><span /><span /><span /><span /><span /></div>
          <small>Endpoint: POST /predict</small>
        </aside>
      </div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </main>
  )
}

function ResultModal({ result, onClose }) {
  const percentage = Math.round(result.failure_probability * 100)
  const isFailure = result.status === 'Failure Likely'
  
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`result-modal ${isFailure ? 'danger' : 'healthy'}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
        <button className="close-button" onClick={onClose} aria-label="Close prediction">x</button>
        <p className="eyebrow">Prediction result — {result.machine_id}</p>
        <div className="result-icon">{result.risk_badge || (isFailure ? '!' : '✓')}</div>
        <h2 id="result-title">{result.status}</h2>
        <p className="risk-copy">Risk level: <strong>{result.risk_level}</strong></p>
        
        <div className="probability">
          <div><span>Failure probability</span><strong>{percentage}%</strong></div>
          <div className="meter"><i style={{ width: `${percentage}%` }} /></div>
        </div>

        {result.diagnosed_failure_mode && (
          <p className="failure-mode"><strong>Diagnosed Mode:</strong> {result.diagnosed_failure_mode}</p>
        )}

        <div className="result-columns">
          <div>
            <h4>Possible causes</h4>
            <ul>{result.root_causes.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h4>Recommended actions</h4>
            <ul>{result.recommended_actions.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
        
        <button className="secondary-button" onClick={onClose}>Close result</button>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)