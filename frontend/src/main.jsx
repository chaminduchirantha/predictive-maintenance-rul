import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const initialForm = {
  type: 'M',
  airTemperature: '298.1',
  processTemperature: '308.6',
  rotationalSpeed: '1550',
  torque: '42.8',
  toolWear: '35',
}

const fields = [
  ['airTemperature', 'Air temperature', 'K', 'Ambient temperature around the machine'],
  ['processTemperature', 'Process temperature', 'K', 'Temperature during operation'],
  ['rotationalSpeed', 'Rotational speed', 'rpm', 'Current spindle speed'],
  ['torque', 'Torque', 'Nm', 'Applied cutting torque'],
  ['toolWear', 'Tool wear', 'min', 'Minutes since tool replacement'],
]

function getPrediction(form) {
  const air = Number(form.airTemperature)
  const process = Number(form.processTemperature)
  const speed = Number(form.rotationalSpeed)
  const torque = Number(form.torque)
  const wear = Number(form.toolWear)
  const temperatureDifference = process - air

  // This browser-only preview follows the notebook's diagnostic thresholds.
  let probability = 0.04
  if (wear >= 200) probability += 0.43
  else if (wear >= 100) probability += 0.15
  if (torque >= 60) probability += 0.29
  else if (torque >= 50) probability += 0.1
  if (speed < 1400) probability += 0.18
  if (temperatureDifference >= 12) probability += 0.08
  if (form.type === 'H') probability += 0.03
  probability = Math.min(0.98, Math.max(0.02, probability))

  const causes = []
  const actions = []
  if (wear >= 200) {
    causes.push('High tool wear')
    actions.push('Replace the cutting tool')
  }
  if (torque >= 60) {
    causes.push('High torque')
    actions.push('Check machine load')
  }
  if (speed < 1400) {
    causes.push('Low rotational speed')
    actions.push('Check motor and drive system')
  }
  if (temperatureDifference >= 12) {
    causes.push('Large process-to-air temperature difference')
    actions.push('Inspect cooling and thermal conditions')
  }
  if (!causes.length) {
    causes.push('No major abnormality detected')
    actions.push('Continue regular maintenance')
  }

  return {
    status: probability >= 0.5 ? 'Failure Likely' : 'Normal',
    probability,
    risk: probability >= 0.75 ? 'Critical' : probability >= 0.5 ? 'High' : probability >= 0.25 ? 'Moderate' : 'Low',
    causes,
    actions,
  }
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [result, setResult] = useState(null)

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    setResult(getPrediction(form))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">PM</div>
        <div><p className="eyebrow">Predictive maintenance</p><h1>PredictaMaint</h1></div>
        <div className="model-status"><span /> Notebook model interface</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow accent">Machine health assessment</p>
          <h2>Spot the warning signs<br /><em>before</em> downtime.</h2>
          <p className="intro-copy">Enter the operating conditions below to estimate failure risk from the AI4I 2020 machine diagnostics model.</p>
        </div>
        <div className="intro-stat"><strong>98%</strong><span>notebook test accuracy</span></div>
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
    
    {/* සියලුම fields (Product type ඇතුළුව) එකම grid එකකට දාලා තියෙන්නේ */}
    <div className="field-grid">
      <label className="field type-field">
        Product type 
        <span className="field-help">Category used during training</span>
        <select name="type" value={form.type} onChange={updateField}>
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

    <button className="predict-button" type="submit">
      Run health prediction <span>{'->'}</span>
    </button>
  </form>

  <aside className="side-note">
    <span className="note-number">02</span>
    <h3>Designed around your notebook</h3>
    <p>The form uses the six machine inputs required by the training and diagnostic sections of the project notebook.</p>
    <div className="signal-line"><span /><span /><span /><span /><span /></div>
    <small>Feature engineering is represented in the browser for this frontend-only prototype.</small>
  </aside>
</div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </main>
  )
}

function ResultModal({ result, onClose }) {
  const percentage = Math.round(result.probability * 100)
  const isFailure = result.status === 'Failure Likely'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`result-modal ${isFailure ? 'danger' : 'healthy'}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
      <button className="close-button" onClick={onClose} aria-label="Close prediction">x</button>
      <p className="eyebrow">Prediction result</p><div className="result-icon">{isFailure ? '!' : '✓'}</div>
      <h2 id="result-title">{result.status}</h2><p className="risk-copy">Risk level: <strong>{result.risk}</strong></p>
      <div className="probability"><div><span>Failure probability</span><strong>{percentage}%</strong></div><div className="meter"><i style={{ width: `${percentage}%` }} /></div></div>
      <div className="result-columns"><div><h4>Possible causes</h4><ul>{result.causes.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h4>Recommended actions</h4><ul>{result.actions.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
      <button className="secondary-button" onClick={onClose}>Close result</button>
    </section>
  </div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)