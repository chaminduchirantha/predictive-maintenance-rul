import { StrictMode, useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { 
  predictMachineHealth, 
  sendTechnicianFeedback, 
  triggerModelRetrain,
  predictBatchMachineHealth,
  getServiceStatus,
  getModelMetrics
} from './api'
import './styles.css'

// Default baseline single-machine form
const initialSingleForm = {
  Machine_ID: 'CNC-MILL-01',
  Type: 'M',
  Air_temperature_K: '298.1',
  Process_temperature_K: '308.6',
  Rotational_speed_rpm: '1550',
  Torque_Nm: '42.8',
  Tool_wear_min: '35'
}

// Sample industrial fleet records for 1-click test populating into the editable table
const sampleFleetPresets = [
  { Machine_ID: 'CNC-LINE1-01', Type: 'M', Air_temperature_K: '298.1', Process_temperature_K: '308.6', Rotational_speed_rpm: '1550', Torque_Nm: '42.8', Tool_wear_min: '35' },
  { Machine_ID: 'CNC-LINE1-02', Type: 'L', Air_temperature_K: '304.5', Process_temperature_K: '313.8', Rotational_speed_rpm: '1200', Torque_Nm: '68.5', Tool_wear_min: '225' },
  { Machine_ID: 'LATHE-SEC2-04', Type: 'H', Air_temperature_K: '302.2', Process_temperature_K: '311.4', Rotational_speed_rpm: '1380', Torque_Nm: '58.0', Tool_wear_min: '190' },
  { Machine_ID: 'MILL-MAIN-07', Type: 'M', Air_temperature_K: '297.8', Process_temperature_K: '307.9', Rotational_speed_rpm: '2820', Torque_Nm: '16.4', Tool_wear_min: '45' }
]

const singleFields = [
  ['Air_temperature_K', 'Air temperature', 'K', 'Ambient temperature around machine (295 - 305 K)'],
  ['Process_temperature_K', 'Process temperature', 'K', 'Operating temperature during cut (305 - 315 K)'],
  ['Rotational_speed_rpm', 'Rotational speed', 'rpm', 'Spindle angular velocity (1100 - 2900 rpm)'],
  ['Torque_Nm', 'Torque', 'Nm', 'Cutting torque applied to workpiece (3 - 80 Nm)'],
  ['Tool_wear_min', 'Tool wear', 'min', 'Accumulated tool operation time (0 - 250 min)']
]

// Pure JS CSV Parser: supports quotes, commas, semicolons, and various header naming conventions
function parseCSVTelemetry(csvText) {
  const lines = csvText.split(/\r\n|\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row.')
  }

  // Detect delimiter (comma or semicolon)
  const headerLine = lines[0]
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';' : ','
  
  const rawHeaders = headerLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim())

  // Header mapping dictionary
  const mapHeaderKey = (h) => {
    const clean = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (clean === 'machineid' || clean === 'productid' || clean === 'udi' || clean === 'id') return 'Machine_ID'
    if (clean === 'type' || clean === 'producttype') return 'Type'
    if (clean.includes('airtemp') || clean.includes('airtemperature')) return 'Air_temperature_K'
    if (clean.includes('processtemp') || clean.includes('processtemperature')) return 'Process_temperature_K'
    if (clean.includes('rotationalspeed') || clean.includes('speed') || clean.includes('rpm')) return 'Rotational_speed_rpm'
    if (clean.includes('torque') || clean.includes('nm')) return 'Torque_Nm'
    if (clean.includes('toolwear') || clean.includes('wear') || clean.includes('min')) return 'Tool_wear_min'
    return h
  }

  const mappedHeaders = rawHeaders.map(mapHeaderKey)

  const records = []
  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim())
    if (rawCols.length < 5) continue // Skip incomplete rows

    const rowObj = {
      Machine_ID: `MCH-${String(i).padStart(3, '0')}`,
      Type: 'M',
      Air_temperature_K: '298.1',
      Process_temperature_K: '308.6',
      Rotational_speed_rpm: '1550',
      Torque_Nm: '42.0',
      Tool_wear_min: '30'
    }

    mappedHeaders.forEach((key, colIdx) => {
      const val = rawCols[colIdx]
      if (val !== undefined && val !== '') {
        if (key === 'Type') {
          rowObj.Type = val.toUpperCase().slice(0, 1) || 'M'
        } else if (key === 'Machine_ID') {
          rowObj.Machine_ID = val
        } else if (rowObj[key] !== undefined) {
          rowObj[key] = val
        }
      }
    })

    records.push(rowObj)
  }

  if (records.length === 0) {
    throw new Error('Could not parse any valid machine records from CSV.')
  }

  return records
}

function App() {
  // Navigation: 'single' | 'batch'
  const [activeTab, setActiveTab] = useState('single')

  // Single Machine Form & Result
  const [singleForm, setSingleForm] = useState(initialSingleForm)
  const [singleResult, setSingleResult] = useState(null)
  const [singleLoading, setSingleLoading] = useState(false)

  // Batch Fleet Workspace State
  const [fleetList, setFleetList] = useState(sampleFleetPresets)
  const [batchResults, setBatchResults] = useState(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchFilter, setBatchFilter] = useState('ALL') // 'ALL' | 'FAILURE' | 'NORMAL'
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Feedback Modal State for Batch items
  const [selectedBatchItemForFeedback, setSelectedBatchItemForFeedback] = useState(null)

  // Global Status & Retraining
  const [serviceStatus, setServiceStatus] = useState({ 
    online: false, 
    model: 'Checking...', 
    statusText: 'Connecting...',
    featureCount: 0,
    loadedAt: null 
  })
  const [metrics, setMetrics] = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [retrainLoading, setRetrainLoading] = useState(false)
  const [error, setError] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)

  useEffect(() => {
    checkHealth()
    fetchMetrics()
  }, [])

  async function checkHealth() {
    try {
      const statusData = await getServiceStatus()
      setServiceStatus({
        online: true,
        model: statusData.model_architecture || statusData.model_name || 'GradientBoostingClassifier',
        statusText: statusData.status === 'operational' ? 'Operational' : (statusData.status || 'Active'),
        featureCount: statusData.feature_count || 9,
        loadedAt: statusData.loaded_at ? new Date(statusData.loaded_at).toLocaleTimeString() : 'Ready'
      })
    } catch {
      setServiceStatus({ 
        online: false, 
        model: 'Offline', 
        statusText: 'Disconnected',
        featureCount: 0,
        loadedAt: null 
      })
    }
  }

  async function fetchMetrics() {
    setMetricsLoading(true)
    try {
      const data = await getModelMetrics()
      setMetrics(data)
    } catch {
      // Keep UI clean if metrics endpoint not ready
    } finally {
      setMetricsLoading(false)
    }
  }

  function handleSingleFormChange(e) {
    const { name, value } = e.target
    setSingleForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSingleSubmit(e) {
    e.preventDefault()
    setSingleLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const data = await predictMachineHealth(singleForm)
      setSingleResult(data)
    } catch (err) {
      setError(err.message || 'Unable to connect to predictive service.')
    } finally {
      setSingleLoading(false)
    }
  }

  // --- Fleet CSV File Upload Handler ---
  function handleCSVUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    parseFileContent(file)
  }

  function handleDropFile(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a valid .csv file.')
      return
    }
    parseFileContent(file)
  }

  function parseFileContent(file) {
    setError(null)
    setInfoMessage(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = parseCSVTelemetry(event.target.result)
        setFleetList(parsed)
        setBatchResults(null)
        setInfoMessage(`Successfully loaded ${parsed.length} machine records from "${file.name}".`)
      } catch (err) {
        setError(err.message || 'Failed to parse CSV file.')
      }
    }
    reader.onerror = () => setError('Error reading selected file.')
    reader.readAsText(file)
  }

  // Download Sample CSV Template
  function handleDownloadTemplate() {
    const headers = 'Machine_ID,Type,Air_temperature_K,Process_temperature_K,Rotational_speed_rpm,Torque_Nm,Tool_wear_min\n'
    const rows = sampleFleetPresets.map(r => 
      `${r.Machine_ID},${r.Type},${r.Air_temperature_K},${r.Process_temperature_K},${r.Rotational_speed_rpm},${r.Torque_Nm},${r.Tool_wear_min}`
    ).join('\n')
    
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'predictamaint_fleet_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Load Preset Fleet
  function handleLoadPreset() {
    setFleetList(sampleFleetPresets)
    setBatchResults(null)
    setInfoMessage('Loaded sample industrial fleet (4 machines) into the editor.')
  }

  // Add Row in Fleet Table
  function handleAddFleetRow() {
    const newIdx = fleetList.length + 1
    const newRow = {
      Machine_ID: `CNC-LINE-${String(newIdx).padStart(2, '0')}`,
      Type: 'M',
      Air_temperature_K: '298.5',
      Process_temperature_K: '308.8',
      Rotational_speed_rpm: '1500',
      Torque_Nm: '40.0',
      Tool_wear_min: '40'
    }
    setFleetList([...fleetList, newRow])
  }

  // Update specific field in Fleet Table
  function handleFleetRowChange(index, field, value) {
    setFleetList(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  // Delete Row from Fleet Table
  function handleDeleteFleetRow(index) {
    setFleetList(prev => prev.filter((_, idx) => idx !== index))
  }

  // Run Fleet Batch Prediction on Real Table Data
  async function handleExecuteBatch() {
    if (fleetList.length === 0) {
      setError('Fleet list is empty. Upload a CSV or add machines to analyze.')
      return
    }

    setBatchLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const response = await predictBatchMachineHealth(fleetList)
      setBatchResults(response)
      setInfoMessage(`Analyzed ${response.length} machines successfully.`)
    } catch (err) {
      setError(err.message || 'Batch prediction request failed.')
    } finally {
      setBatchLoading(false)
    }
  }

  // Export Batch Results to CSV
  function handleExportBatchCSV() {
    if (!batchResults || batchResults.length === 0) return
    const headers = 'Machine_ID,Status,Failure_Probability,Risk_Level,Diagnosed_Failure_Mode,Root_Causes,Recommended_Actions,Timestamp\n'
    const rows = batchResults.map(item => {
      const causes = `"${(item.root_causes || []).join('; ')}"`
      const actions = `"${(item.recommended_actions || []).join('; ')}"`
      return `${item.machine_id},${item.status},${(item.failure_probability * 100).toFixed(1)}%,${item.risk_level},"${item.diagnosed_failure_mode}",${causes},${actions},${item.timestamp}`
    }).join('\n')

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `predictamaint_batch_report_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Trigger Model Retraining with auto-refresh poll
  async function handleTriggerRetrain() {
    setRetrainLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const response = await triggerModelRetrain()
      setInfoMessage(response.message || 'Model retraining started asynchronously in background.')
      
      // Poll every 3 seconds for 15 seconds to auto-refresh metrics once new model is reloaded
      let checks = 0
      const pollInterval = setInterval(async () => {
        checks++
        await checkHealth()
        await fetchMetrics()
        if (checks >= 5) {
          clearInterval(pollInterval)
          setInfoMessage('Retraining complete. New model artifacts and metrics active!')
        }
      }, 3000)
    } catch (err) {
      setError(err.message || 'Failed to trigger model retraining.')
    } finally {
      setRetrainLoading(false)
    }
  }

  // Batch Result Statistics
  const totalBatch = batchResults ? batchResults.length : 0
  const failingBatch = batchResults ? batchResults.filter(b => b.status === 'Failure Likely').length : 0
  const healthyBatch = totalBatch - failingBatch
  const avgRisk = batchResults && totalBatch > 0 
    ? (batchResults.reduce((acc, b) => acc + (b.failure_probability || 0), 0) / totalBatch * 100).toFixed(1)
    : 0

  const filteredBatchResults = batchResults ? batchResults.filter(item => {
    if (batchFilter === 'FAILURE') return item.status === 'Failure Likely'
    if (batchFilter === 'NORMAL') return item.status !== 'Failure Likely'
    return true
  }) : []

  return (
    <main className="app-shell">
      {/* 1. Header Bar with Dynamic Service Health */}
      <header className="topbar">
        <div className="brand-mark">PM</div>
        <div>
          <p className="eyebrow">Industrial AI Diagnostics</p>
          <h1>PredictaMaint</h1>
        </div>
        
        <div className={`model-status ${serviceStatus.online ? 'online' : 'offline'}`} title={`Model: ${serviceStatus.model}`}>
          <span style={{ backgroundColor: serviceStatus.online ? '#10b981' : '#ef4444' }} />
          {serviceStatus.online 
            ? `ML Service: ${serviceStatus.statusText} (${serviceStatus.model})` 
            : 'ML Service Offline'}
        </div>
      </header>

      {/* Hero Header */}
      <section className="intro">
        <div>
          <p className="eyebrow accent">AI4I Predictive Maintenance Platform</p>
          <h2>Spot equipment failures<br /><em>before</em> costly downtime.</h2>
          <p className="intro-copy">
            Ingest real-time machine telemetry or batch SCADA logs to evaluate failure risks, diagnose failure modes (TWF, HDF, PWF, OSF), and receive prescriptive maintenance actions.
          </p>
        </div>
        <div className="intro-stat">
          <strong>{serviceStatus.online ? serviceStatus.model.replace('Classifier', '') : 'Offline'}</strong>
          <span>{serviceStatus.statusText} • {serviceStatus.loadedAt ? `Refreshed ${serviceStatus.loadedAt}` : 'Ready'}</span>
        </div>
      </section>

      {/* Global Notifications */}
      {error && <div className="error-banner">{error}</div>}
      {infoMessage && <div className="info-banner">{infoMessage}</div>}

      {/* Mode Switcher Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          <span className="tab-num">01</span> Single Machine Diagnostic
        </button>
        <button 
          className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
          onClick={() => setActiveTab('batch')}
        >
          <span className="tab-num">02</span> Fleet Batch & CSV Ingestion ({fleetList.length} machines)
        </button>
      </div>

      {/* Main Workspace Grid */}
      <div className="workspace">
        {/* TAB 1: SINGLE MACHINE FORM */}
        {activeTab === 'single' && (
          <form className="diagnostic-form" onSubmit={handleSingleSubmit}>
            <div className="form-heading">
              <div>
                <p className="eyebrow">Real-Time Sensor Scoring</p>
                <h3>Machine Operating Telemetry</h3>
              </div>
              <span className="required">Endpoint: POST /predict</span>
            </div>

            <div className="field-grid">
              <label className="field">
                Machine Identifier
                <span className="field-help">Unique shop-floor machine tag</span>
                <input 
                  required 
                  name="Machine_ID" 
                  type="text" 
                  value={singleForm.Machine_ID} 
                  onChange={handleSingleFormChange}
                  placeholder="e.g. CNC-MILL-01" 
                />
              </label>

              <label className="field type-field">
                Product Quality Variant
                <span className="field-help">L (Low 50%), M (Medium 30%), H (High 20%)</span>
                <select name="Type" value={singleForm.Type} onChange={handleSingleFormChange}>
                  <option value="L">L / Light Variant</option>
                  <option value="M">M / Medium Variant</option>
                  <option value="H">H / High Variant</option>
                </select>
              </label>

              {singleFields.map(([name, label, unit, help]) => (
                <label className="field" key={name}>
                  {label}
                  <span className="field-help">{help}</span>
                  <div className="input-wrap">
                    <input 
                      required 
                      name={name} 
                      type="number" 
                      step="any" 
                      value={singleForm[name]} 
                      onChange={handleSingleFormChange} 
                    />
                    <span>{unit}</span>
                  </div>
                </label>
              ))}
            </div>

            <button className="predict-button" type="submit" disabled={singleLoading}>
              {singleLoading ? 'Running ML Inference & Physics Diagnostics...' : 'Run Machine Diagnostic'}
              <span>→</span>
            </button>
          </form>
        )}

        {/* TAB 2: BATCH CSV INGESTION & INTERACTIVE FLEET TABLE */}
        {activeTab === 'batch' && (
          <div className="batch-workspace-panel">
            <div className="form-heading">
              <div>
                <p className="eyebrow">Fleet Scalability</p>
                <h3>Multi-Machine Batch Telemetry Hub</h3>
              </div>
              <span className="required">Endpoint: POST /batch-predict</span>
            </div>

            {/* CSV File Dropzone */}
            <div 
              className={`csv-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDropFile}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleCSVUpload} 
                accept=".csv" 
                style={{ display: 'none' }} 
              />
              <div className="dropzone-content">
                <div className="dropzone-icon">📁</div>
                <h4>Drag & Drop Telemetry CSV file here, or click to browse</h4>
                <p>Supports SCADA logs with columns: <code>Machine_ID, Type, Air_temp, Process_temp, Speed, Torque, Tool_wear</code></p>
              </div>
            </div>

            {/* Fleet Controls Bar */}
            <div className="fleet-controls-bar">
              <div className="fleet-actions-left">
                <button type="button" className="btn-small secondary" onClick={handleDownloadTemplate}>
                  📥 Download CSV Template
                </button>
                <button type="button" className="btn-small secondary" onClick={handleLoadPreset}>
                  🔄 Reset to Sample Fleet (4)
                </button>
                <button type="button" className="btn-small secondary" onClick={handleAddFleetRow}>
                  ➕ Add Machine Row
                </button>
              </div>

              <div className="fleet-actions-right">
                <span className="fleet-count-badge">{fleetList.length} Machines Queued</span>
                {fleetList.length > 0 && (
                  <button type="button" className="btn-text-danger" onClick={() => { setFleetList([]); setBatchResults(null) }}>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Editable Fleet Table */}
            {fleetList.length > 0 ? (
              <div className="fleet-table-container">
                <table className="fleet-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Machine ID</th>
                      <th>Type</th>
                      <th>Air Temp (K)</th>
                      <th>Proc Temp (K)</th>
                      <th>Speed (rpm)</th>
                      <th>Torque (Nm)</th>
                      <th>Wear (min)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetList.map((row, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <input 
                            className="table-input"
                            value={row.Machine_ID} 
                            onChange={(e) => handleFleetRowChange(idx, 'Machine_ID', e.target.value)}
                            placeholder="MCH-01" 
                          />
                        </td>
                        <td>
                          <select 
                            className="table-select"
                            value={row.Type} 
                            onChange={(e) => handleFleetRowChange(idx, 'Type', e.target.value)}
                          >
                            <option value="L">L</option>
                            <option value="M">M</option>
                            <option value="H">H</option>
                          </select>
                        </td>
                        <td>
                          <input 
                            className="table-input num"
                            type="number" 
                            step="0.1" 
                            value={row.Air_temperature_K} 
                            onChange={(e) => handleFleetRowChange(idx, 'Air_temperature_K', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="table-input num"
                            type="number" 
                            step="0.1" 
                            value={row.Process_temperature_K} 
                            onChange={(e) => handleFleetRowChange(idx, 'Process_temperature_K', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="table-input num"
                            type="number" 
                            step="1" 
                            value={row.Rotational_speed_rpm} 
                            onChange={(e) => handleFleetRowChange(idx, 'Rotational_speed_rpm', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="table-input num"
                            type="number" 
                            step="0.1" 
                            value={row.Torque_Nm} 
                            onChange={(e) => handleFleetRowChange(idx, 'Torque_Nm', e.target.value)} 
                          />
                        </td>
                        <td>
                          <input 
                            className="table-input num"
                            type="number" 
                            step="1" 
                            value={row.Tool_wear_min} 
                            onChange={(e) => handleFleetRowChange(idx, 'Tool_wear_min', e.target.value)} 
                          />
                        </td>
                        <td>
                          <button 
                            type="button" 
                            className="btn-icon-danger"
                            onClick={() => handleDeleteFleetRow(idx)}
                            title="Remove machine row"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-fleet-state">
                <p>No machines currently in batch list. Click <strong>"Add Machine Row"</strong>, <strong>"Reset to Sample Fleet"</strong>, or upload a CSV file above.</p>
              </div>
            )}

            {/* Execute Batch Button */}
            <button 
              className="predict-button" 
              type="button" 
              onClick={handleExecuteBatch} 
              disabled={batchLoading || fleetList.length === 0}
              style={{ marginTop: '20px' }}
            >
              {batchLoading ? `Evaluating ${fleetList.length} Machines via API...` : `Analyze Fleet Telemetry (${fleetList.length} Machines)`}
              <span>→</span>
            </button>
          </div>
        )}

        {/* SIDEBAR: MODEL INTELLIGENCE & ACTIVE LIFECYCLE */}
        <aside className="side-note">
          <span className="note-number">03</span>
          <h3>Model Telemetry</h3>
          <p>Scored with AI4I 2020 trained machine intelligence, incorporating thermodynamics, power mechanics, and overstrain limits.</p>
          
          <div className="signal-line"><span /><span /><span /><span /><span /></div>

          {/* Dynamic Feature Importances from GET /metrics */}
          <div className="metrics-box">
            <div className="metrics-head">
              <h4>Feature Importances</h4>
              <span className="metrics-badge">{serviceStatus.featureCount} Features</span>
            </div>
            
            {metricsLoading ? (
              <p className="loading-copy">Fetching dynamic model weights...</p>
            ) : metrics?.feature_importances ? (
              <div className="feature-bars">
                {Object.entries(metrics.feature_importances).map(([feat, weight]) => {
                  const pct = (weight * 100).toFixed(1)
                  return (
                    <div key={feat} className="feature-bar-item">
                      <div className="feature-labels">
                        <span className="feat-name">{feat}</span>
                        <span className="feat-pct">{pct}%</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(Number(pct), 2)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="loading-copy">Connecting to metrics service...</p>
            )}
          </div>

          {/* Retraining Trigger (POST /retrain) */}
          <div className="retrain-box">
            <h4>Continuous Retraining</h4>
            <p className="retrain-desc">Triggers background pipeline retraining on logged feedback data without service interruption.</p>
            <button 
              className="secondary-button" 
              type="button"
              onClick={handleTriggerRetrain} 
              disabled={retrainLoading}
            >
              {retrainLoading ? 'Queuing Retraining...' : 'Trigger Model Retraining'}
            </button>
          </div>
        </aside>
      </div>

      {/* FLEET BATCH DIAGNOSTIC DASHBOARD (TAB 2 RESULTS) */}
      {batchResults && (
        <section className="batch-results-dashboard">
          <div className="batch-results-header">
            <div>
              <p className="eyebrow accent">Diagnostics Overview</p>
              <h2>Fleet Health Assessment Report</h2>
            </div>
            
            <div className="batch-header-actions">
              <button className="secondary-button" onClick={handleExportBatchCSV} style={{ margin: 0 }}>
                📊 Export CSV Report
              </button>
              <button className="secondary-button" onClick={() => setBatchResults(null)} style={{ margin: 0 }}>
                Clear Results
              </button>
            </div>
          </div>

          {/* Aggregate KPI Summary Cards */}
          <div className="fleet-summary-grid">
            <div className="fleet-stat-card">
              <span className="stat-label">Total Evaluated</span>
              <strong className="stat-value">{totalBatch}</strong>
              <span className="stat-sub">Machines in batch</span>
            </div>

            <div className="fleet-stat-card healthy-card">
              <span className="stat-label">Normal Operations</span>
              <strong className="stat-value">{healthyBatch}</strong>
              <span className="stat-sub">{totalBatch > 0 ? ((healthyBatch / totalBatch) * 100).toFixed(0) : 0}% Healthy</span>
            </div>

            <div className="fleet-stat-card danger-card">
              <span className="stat-label">Failure Likely (Critical)</span>
              <strong className="stat-value">{failingBatch}</strong>
              <span className="stat-sub">{totalBatch > 0 ? ((failingBatch / totalBatch) * 100).toFixed(0) : 0}% Requiring Action</span>
            </div>

            <div className="fleet-stat-card">
              <span className="stat-label">Avg Fleet Risk</span>
              <strong className="stat-value">{avgRisk}%</strong>
              <span className="stat-sub">Mean failure probability</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="batch-filter-bar">
            <span className="filter-label">Filter Status:</span>
            <button 
              className={`filter-chip ${batchFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setBatchFilter('ALL')}
            >
              All ({totalBatch})
            </button>
            <button 
              className={`filter-chip danger ${batchFilter === 'FAILURE' ? 'active' : ''}`}
              onClick={() => setBatchFilter('FAILURE')}
            >
              Critical / Failure ({failingBatch})
            </button>
            <button 
              className={`filter-chip healthy ${batchFilter === 'NORMAL' ? 'active' : ''}`}
              onClick={() => setBatchFilter('NORMAL')}
            >
              Normal ({healthyBatch})
            </button>
          </div>

          {/* Batch Diagnostic Cards */}
          <div className="batch-cards-grid">
            {filteredBatchResults.map((item, index) => {
              const isFail = item.status === 'Failure Likely'
              const probPct = Math.round((item.failure_probability || 0) * 100)
              
              return (
                <div key={index} className={`batch-diagnostic-card ${isFail ? 'is-danger' : 'is-healthy'}`}>
                  <div className="card-top">
                    <div>
                      <span className="machine-tag">{item.machine_id}</span>
                      <h4 className="machine-status-title">{item.status}</h4>
                    </div>
                    <span className={`risk-pill ${item.risk_level.toLowerCase()}`}>
                      {item.risk_badge} {item.risk_level} Risk
                    </span>
                  </div>

                  <div className="probability-strip">
                    <div className="prob-label">
                      <span>Failure Probability</span>
                      <strong>{probPct}%</strong>
                    </div>
                    <div className="meter-small">
                      <i style={{ width: `${probPct}%`, backgroundColor: isFail ? '#e11d48' : '#10b981' }} />
                    </div>
                  </div>

                  {item.diagnosed_failure_mode && (
                    <div className="diagnosed-mode-tag">
                      <strong>Mode:</strong> {item.diagnosed_failure_mode}
                    </div>
                  )}

                  {item.root_causes && item.root_causes.length > 0 && (
                    <div className="card-section">
                      <h5>Root Causes</h5>
                      <ul>
                        {item.root_causes.slice(0, 2).map((rc, i) => <li key={i}>{rc}</li>)}
                      </ul>
                    </div>
                  )}

                  {item.recommended_actions && item.recommended_actions.length > 0 && (
                    <div className="card-section">
                      <h5>Recommended Actions</h5>
                      <ul>
                        {item.recommended_actions.slice(0, 2).map((ra, i) => <li key={i}>{ra}</li>)}
                      </ul>
                    </div>
                  )}

                  <button 
                    className="btn-feedback-trigger"
                    onClick={() => setSelectedBatchItemForFeedback(item)}
                  >
                    📝 Log Technician Feedback
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* SINGLE MACHINE RESULT MODAL */}
      {singleResult && (
        <ResultModal 
          result={singleResult} 
          onClose={() => setSingleResult(null)} 
        />
      )}

      {/* BATCH ITEM FEEDBACK MODAL */}
      {selectedBatchItemForFeedback && (
        <ResultModal 
          result={selectedBatchItemForFeedback} 
          onClose={() => setSelectedBatchItemForFeedback(null)} 
        />
      )}
    </main>
  )
}

// Result Modal with Full Diagnostic Assessment & Active Learning Feedback
function ResultModal({ result, onClose }) {
  const percentage = Math.round(result.failure_probability * 100)
  const isFailure = result.status === 'Failure Likely'
  
  const [actualFailure, setActualFailure] = useState(isFailure ? 1 : 0)
  const [actualFailureMode, setActualFailureMode] = useState(
    result.diagnosed_failure_mode && result.diagnosed_failure_mode !== 'None' 
      ? result.diagnosed_failure_mode 
      : 'Tool Wear Failure (TWF)'
  )
  const [notes, setNotes] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  // Freeze background scrolling when modal is active
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
        actual_failure_mode: actualFailure === 1 ? actualFailureMode : 'None',
        technician_notes: notes
      })
      setFeedbackStatus('Ground truth recorded successfully in feedback database!')
      setFeedbackSubmitted(true)
    } catch (err) {
      setFeedbackStatus(err.message || 'Failed to record technician feedback.')
    } finally {
      setFeedbackLoading(false)
    }
  }
  
  return (
    <div className="modal-backdrop" role="presentation">
      <section 
        className={`result-modal ${isFailure ? 'danger' : 'healthy'}`} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="result-title"
      >
        <button className="close-button" onClick={onClose} aria-label="Close prediction">×</button>
        <p className="eyebrow">Diagnostic Assessment — {result.machine_id}</p>
        <div className="result-icon">{result.risk_badge || (isFailure ? '⚠️' : '✓')}</div>
        <h2 id="result-title">{result.status}</h2>
        <p className="risk-copy">Risk Classification: <strong>{result.risk_level}</strong></p>
        
        <div className="probability">
          <div>
            <span>Calculated Failure Probability</span>
            <strong>{percentage}%</strong>
          </div>
          <div className="meter">
            <i style={{ width: `${percentage}%` }} />
          </div>
        </div>

        {result.diagnosed_failure_mode && (
          <p className="failure-mode">
            <strong>Diagnosed Failure Mode:</strong> {result.diagnosed_failure_mode}
          </p>
        )}

        <div className="result-columns">
          <div>
            <h4>Possible Root Causes</h4>
            <ul>
              {result.root_causes && result.root_causes.length > 0 
                ? result.root_causes.map((item) => <li key={item}>{item}</li>)
                : <li>Operating within normal nominal thresholds.</li>}
            </ul>
          </div>
          <div>
            <h4>Recommended Maintenance Actions</h4>
            <ul>
              {result.recommended_actions && result.recommended_actions.length > 0 
                ? result.recommended_actions.map((item) => <li key={item}>{item}</li>)
                : <li>Continue scheduled periodic telemetry logging.</li>}
            </ul>
          </div>
        </div>

        <hr className="modal-divider" />
        
        {/* Active Learning Technician Feedback Form */}
        <form onSubmit={handleFeedbackSubmit} className="feedback-form">
          <h4 className="feedback-title">Log Ground Truth (Active Learning Feedback)</h4>
          <p className="feedback-sub">Submit verified maintenance ground truth to train future model iterations.</p>
          
          <div className="feedback-radio-group">
            <label className={`radio-pill ${actualFailure === 0 ? 'selected' : ''}`}>
              <input 
                type="radio" 
                name="actual_failure" 
                value="0" 
                checked={actualFailure === 0} 
                onChange={() => setActualFailure(0)} 
              />
              Machine Healthy (0)
            </label>

            <label className={`radio-pill ${actualFailure === 1 ? 'selected' : ''}`}>
              <input 
                type="radio" 
                name="actual_failure" 
                value="1" 
                checked={actualFailure === 1} 
                onChange={() => setActualFailure(1)} 
              />
              Machine Failed (1)
            </label>
          </div>

          {actualFailure === 1 && (
            <div className="feedback-field">
              <label>Actual Verified Failure Mode</label>
              <select 
                value={actualFailureMode} 
                onChange={(e) => setActualFailureMode(e.target.value)}
                className="feedback-select"
              >
                <option value="Tool Wear Failure (TWF)">Tool Wear Failure (TWF)</option>
                <option value="Heat Dissipation Failure (HDF)">Heat Dissipation Failure (HDF)</option>
                <option value="Power Failure (PWF)">Power Failure (PWF)</option>
                <option value="Overstrain Failure (OSF)">Overstrain Failure (OSF)</option>
                <option value="Random Failure (RNF)">Random Failure (RNF)</option>
                <option value="Other / Mechanical Fault">Other / Mechanical Fault</option>
              </select>
            </div>
          )}

          <input 
            type="text" 
            placeholder="Technician Notes (e.g. Spindle bearing replaced, cycle 220 min)" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            className="feedback-notes-input"
            disabled={feedbackSubmitted}
          />

          <button 
            type="submit" 
            className="secondary-button" 
            disabled={feedbackLoading || feedbackSubmitted}
          >
            {feedbackLoading ? 'Submitting Feedback...' : (feedbackSubmitted ? '✓ Feedback Recorded' : 'Submit Feedback to Pipeline')}
          </button>
          
          {feedbackStatus && (
            <p className={`feedback-message ${feedbackStatus.includes('Failed') ? 'error' : 'success'}`}>
              {feedbackStatus}
            </p>
          )}
        </form>
        
        <button className="secondary-button close-btn" onClick={onClose}>
          Close Assessment
        </button>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)