import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { predictMachineHealth, sendTechnicianFeedback, triggerModelRetrain } from './api'
import './styles.css'

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
  const [retrainLoading, setRetrainLoading] = useState(false)
  const [error, setError] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const data = await predictMachineHealth(form)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Unable to connect to prediction server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerRetrain() {
    setRetrainLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const response = await triggerModelRetrain()
      setInfoMessage(response.message || 'Retraining started successfully.')
    } catch (err) {
      setError(err.message || 'Failed to start retraining.')
    } finally {
      setRetrainLoading(false)
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
          {infoMessage && <div className="info-banner" style={{ padding: '10px', background: '#1e3a8a', color: '#fff', borderRadius: '6px', marginBottom: '15px' }}>{infoMessage}</div>}

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
          
          <div style={{ marginTop: '20px' }}>
            <button 
              className="secondary-button" 
              onClick={handleTriggerRetrain} 
              disabled={retrainLoading}
              style={{ width: '100%' }}
            >
              {retrainLoading ? 'Queuing Task...' : 'Trigger Model Retraining'}
            </button>
          </div>
        </aside>
      </div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </main>
  )
}

function ResultModal({ result, onClose }) {
  const percentage = Math.round(result.failure_probability * 100)
  const isFailure = result.status === 'Failure Likely'
  
  const [actualFailure, setActualFailure] = useState(0)
  const [notes, setNotes] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  // Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  async function handleFeedbackSubmit(e) {
    e.preventDefault()
    setFeedbackLoading(true)
    setFeedbackStatus(null)

    try {
      await sendTechnicianFeedback({
        machine_id: result.machine_id,
        predicted_status: result.status,
        actual_failure: actualFailure,
        actual_failure_mode: result.diagnosed_failure_mode,
        technician_notes: notes
      })
      setFeedbackStatus('Feedback recorded successfully!')
    } catch (err) {
      setFeedbackStatus('Failed to record feedback.')
    } finally {
      setFeedbackLoading(false)
    }
  }
  
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

        {/* Clean Technician Feedback Section */}
        <hr style={{ margin: '24px 0 16px', borderColor: 'rgba(0,0,0,0.08)' }} />
        
        <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Log Ground Truth (Technician Feedback)</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              background: actualFailure === 0 ? 'rgba(0, 0, 0, 0.05)' : 'transparent'
            }}>
              <input 
                type="radio" 
                name="actual_failure" 
                value="0" 
                checked={actualFailure === 0} 
                onChange={() => setActualFailure(0)} 
                style={{ width: '16px', height: '16px', margin: 0 }}
              />
              Machine Healthy (0)
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              background: actualFailure === 1 ? 'rgba(0, 0, 0, 0.05)' : 'transparent'
            }}>
              <input 
                type="radio" 
                name="actual_failure" 
                value="1" 
                checked={actualFailure === 1} 
                onChange={() => setActualFailure(1)} 
                style={{ width: '16px', height: '16px', margin: 0 }}
              />
              Machine Failed (1)
            </label>
          </div>

          <input 
            type="text" 
            placeholder="Technician Notes (optional)" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '10px 12px', 
              borderRadius: '8px', 
              border: '1px solid rgba(0,0,0,0.15)', 
              background: '#fff', 
              color: '#111',
              fontSize: '0.88rem',
              boxSizing: 'border-box'
            }}
          />

          <button type="submit" className="secondary-button" disabled={feedbackLoading} style={{ width: '100%' }}>
            {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
          </button>
          
          {feedbackStatus && (
            <p style={{ fontSize: '0.85rem', margin: '4px 0 0', color: feedbackStatus.includes('Failed') ? '#e11d48' : '#059669', fontWeight: 500 }}>
              {feedbackStatus}
            </p>
          )}
        </form>
        
        <button className="secondary-button" onClick={onClose} style={{ marginTop: '8px', width: '100%' }}>Close result</button>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)