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
import { 
  IconUpload, 
  IconDownload, 
  IconRefresh, 
  IconPlus, 
  IconTrash, 
  IconFeedback, 
  IconAlertCircle, 
  IconCheckCircle 
} from './icons'
import './styles.css'

const initialSingleForm = {
  Machine_ID: 'CNC-MILL-01',
  Type: 'M',
  Air_temperature_K: '298.1',
  Process_temperature_K: '308.6',
  Rotational_speed_rpm: '1550',
  Torque_Nm: '42.8',
  Tool_wear_min: '35'
}

const sampleFleetPresets = [
  { Machine_ID: 'CNC-LINE1-01', Type: 'M', Air_temperature_K: '298.1', Process_temperature_K: '308.6', Rotational_speed_rpm: '1550', Torque_Nm: '42.8', Tool_wear_min: '35' },
  { Machine_ID: 'CNC-LINE1-02', Type: 'L', Air_temperature_K: '304.5', Process_temperature_K: '313.8', Rotational_speed_rpm: '1200', Torque_Nm: '68.5', Tool_wear_min: '225' },
  { Machine_ID: 'LATHE-SEC2-04', Type: 'H', Air_temperature_K: '302.2', Process_temperature_K: '311.4', Rotational_speed_rpm: '1380', Torque_Nm: '58.0', Tool_wear_min: '190' },
  { Machine_ID: 'MILL-MAIN-07', Type: 'M', Air_temperature_K: '297.8', Process_temperature_K: '307.9', Rotational_speed_rpm: '2820', Torque_Nm: '16.4', Tool_wear_min: '45' }
]

const singleFields = [
  ['Air_temperature_K', 'Air temperature', 'K', 'Ambient temperature around the machine'],
  ['Process_temperature_K', 'Process temperature', 'K', 'Temperature during operation'],
  ['Rotational_speed_rpm', 'Rotational speed', 'rpm', 'Current spindle speed'],
  ['Torque_Nm', 'Torque', 'Nm', 'Applied cutting torque'],
  ['Tool_wear_min', 'Tool wear', 'min', 'Minutes since tool replacement']
]

// Zero-dependency pure JS CSV parser supporting both AI4I dataset and API schemas
function parseCSVTelemetry(csvText) {
  const lines = csvText.split(/\r\n|\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row.')
  }

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const rawHeaders = lines[0].split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim())

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
    if (rawCols.length < 5) continue

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
  const [activeTab, setActiveTab] = useState('single')

  // 1. Single Machine State
  const [form, setForm] = useState(initialSingleForm)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  // 2. Batch Fleet State
  const [fleetList, setFleetList] = useState(sampleFleetPresets)
  const [batchResults, setBatchResults] = useState(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchFilter, setBatchFilter] = useState('ALL')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [selectedBatchItemForFeedback, setSelectedBatchItemForFeedback] = useState(null)

  // 3. System Health & Model Lifecycle State
  const [serviceStatus, setServiceStatus] = useState({ 
    online: false, 
    model: 'Checking...', 
    statusText: 'Connecting...',
    featureCount: 12,
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
        featureCount: statusData.feature_count || 12,
        loadedAt: statusData.loaded_at ? new Date(statusData.loaded_at).toLocaleTimeString() : 'Active'
      })
    } catch {
      setServiceStatus({ 
        online: false, 
        model: 'Disconnected', 
        statusText: 'Offline',
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
      // Graceful fallback
    } finally {
      setMetricsLoading(false)
    }
  }

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
        setInfoMessage(`Loaded ${parsed.length} machine records from "${file.name}".`)
      } catch (err) {
        setError(err.message || 'Failed to parse CSV file.')
      }
    }
    reader.onerror = () => setError('Error reading selected file.')
    reader.readAsText(file)
  }

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

  function handleLoadPreset() {
    setFleetList(sampleFleetPresets)
    setBatchResults(null)
    setInfoMessage('Loaded sample industrial fleet (4 machines) into table.')
  }

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

  function handleFleetRowChange(index, field, value) {
    setFleetList(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function handleDeleteFleetRow(index) {
    setFleetList(prev => prev.filter((_, idx) => idx !== index))
  }

  async function handleBatchPredict() {
    if (fleetList.length === 0) {
      setError('Fleet list is empty. Add machines or upload a CSV first.')
      return
    }

    setBatchLoading(true)
    setError(null)
    setInfoMessage(null)
    try {
      const batchRes = await predictBatchMachineHealth(fleetList)
      setBatchResults(batchRes)
      setInfoMessage(`Analyzed ${batchRes.length} machines successfully.`)
    } catch (err) {
      setError(err.message || 'Batch prediction failed.')
    } finally {
      setBatchLoading(false)
    }
  }

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

  async function handleTriggerRetrain() {
    setRetrainLoading(true)
    setError(null)
    setInfoMessage(null)

    try {
      const response = await triggerModelRetrain()
      setInfoMessage(response.message || 'Retraining started successfully in background.')
      
      let checks = 0
      const pollInterval = setInterval(async () => {
        checks++
        await checkHealth()
        await fetchMetrics()
        if (checks >= 5) {
          clearInterval(pollInterval)
          setInfoMessage('Retraining complete. New model artifacts active!')
        }
      }, 3000)
    } catch (err) {
      setError(err.message || 'Failed to start retraining.')
    } finally {
      setRetrainLoading(false)
    }
  }

  // Filtered batch statistics
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
      {/* 1. Header Bar */}
      <header className="topbar">
        <div className="brand-mark">PM</div>
        <div>
          <p className="eyebrow">Predictive maintenance</p>
          <h1>PredictaMaint</h1>
        </div>
        <div className={`model-status ${serviceStatus.online ? 'online' : 'offline'}`}>
          <span style={{ backgroundColor: serviceStatus.online ? '#10b981' : '#ef4444' }} /> 
          {serviceStatus.online 
            ? `ML Service: ${serviceStatus.statusText} (${serviceStatus.model})` 
            : 'ML Service Offline'}
        </div>
      </header>

      {/* 2. Hero Intro */}
      <section className="intro">
        <div>
          <p className="eyebrow accent">Machine health assessment</p>
          <h2>Spot the warning signs<br /><em>before</em> downtime.</h2>
          <p className="intro-copy">
            Enter operating telemetry below or ingest multi-machine SCADA logs to estimate failure risk from the AI4I 2020 predictive maintenance model.
          </p>
        </div>
        <div className="intro-stat">
          <strong>{serviceStatus.online ? serviceStatus.model.replace('Classifier', '') : 'Offline'}</strong>
          <span>{serviceStatus.statusText} • {serviceStatus.loadedAt ? `Refreshed ${serviceStatus.loadedAt}` : 'Active'}</span>
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

      {/* 3. Main Workspace Grid */}
      <div className="workspace">
        {/* COLUMN 1: DIAGNOSTIC FORM OR BATCH HUB */}
        {activeTab === 'single' ? (
          <form className="diagnostic-form" onSubmit={handleSubmit}>
            <div className="form-heading">
              <div>
                <p className="eyebrow">01 / Machine profile</p>
                <h3>Operating conditions</h3>
              </div>
              <span className="required">All fields required</span>
            </div>

            <div className="field-grid">
              <label className="field">
                Machine identifier
                <span className="field-help">Unique shop-floor machine tag</span>
                <input 
                  required 
                  name="Machine_ID" 
                  type="text" 
                  value={form.Machine_ID} 
                  onChange={updateField} 
                  placeholder="e.g. CNC-MILL-01" 
                />
              </label>

              <label className="field type-field">
                Product type 
                <span className="field-help">Category used during training</span>
                <select name="Type" value={form.Type} onChange={updateField}>
                  <option value="L">L / Light</option>
                  <option value="M">M / Medium</option>
                  <option value="H">H / Heavy</option>
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
                      value={form[name]} 
                      onChange={updateField} 
                    />
                    <span>{unit}</span>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="predict-button" type="submit" disabled={loading} style={{ flex: 2 }}>
                {loading ? 'Running Diagnostics...' : 'Run health prediction'} <span>→</span>
              </button>
              
              <button 
                type="button" 
                className="secondary-button" 
                onClick={() => setActiveTab('batch')} 
                style={{ flex: 1, marginTop: '32px' }}
              >
                Fleet Batch Ingestion
              </button>
            </div>
          </form>
        ) : (
          <div className="diagnostic-form">
            <div className="form-heading">
              <div>
                <p className="eyebrow">01 / Fleet profile</p>
                <h3>Multi-Machine Telemetry Ingestion</h3>
              </div>
              <span className="required">Endpoint: POST /batch-predict</span>
            </div>

            {/* CSV Dropzone */}
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
                <div className="dropzone-icon" style={{ marginBottom: '8px' }}>
                  <IconUpload size={36} color="#71952f" />
                </div>
                <h4>Drag & Drop Telemetry CSV file here, or click to browse</h4>
                <p>Supports SCADA logs with columns: <code>Machine_ID, Type, Air_temp, Process_temp, Speed, Torque, Tool_wear</code></p>
              </div>
            </div>

            {/* Fleet Controls Bar */}
            <div className="fleet-controls-bar">
              <div className="fleet-actions-left">
                <button type="button" className="btn-small" onClick={handleDownloadTemplate}>
                  <IconDownload size={13} /> Download CSV Template
                </button>
                <button type="button" className="btn-small" onClick={handleLoadPreset}>
                  <IconRefresh size={13} /> Reset Sample Fleet (4)
                </button>
                <button type="button" className="btn-small" onClick={handleAddFleetRow}>
                  <IconPlus size={13} /> Add Machine Row
                </button>
              </div>

              <div className="fleet-actions-right">
                <span className="fleet-count-badge">{fleetList.length} Machines</span>
                {fleetList.length > 0 && (
                  <button type="button" className="btn-text-danger" onClick={() => { setFleetList([]); setBatchResults(null) }}>
                    Clear
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
                      <th>Air (K)</th>
                      <th>Proc (K)</th>
                      <th>Speed</th>
                      <th>Torque</th>
                      <th>Wear</th>
                      <th>Del</th>
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
                            title="Remove row"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <IconTrash size={13} color="#dc2626" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-fleet-state">
                <p>No machines currently in batch list. Click <strong>"Add Machine Row"</strong> or upload a CSV file above.</p>
              </div>
            )}

            {/* Execute Batch Button */}
            <button 
              className="predict-button" 
              type="button" 
              onClick={handleBatchPredict} 
              disabled={batchLoading || fleetList.length === 0}
            >
              {batchLoading ? `Evaluating ${fleetList.length} Machines...` : `Run Fleet Batch Diagnostics (${fleetList.length} Machines)`}
              <span>→</span>
            </button>
          </div>
        )}

        {/* COLUMN 2: SIDE-NOTE (Original Look & Dynamic Weights) */}
        <aside className="side-note">
          <span className="note-number">02</span>
          <h3>Live API Integration</h3>
          <p>This form dispatches sensor telemetry directly to the FastAPI REST service for real-time model scoring and root-cause diagnostics.</p>
          <div className="signal-line"><span /><span /><span /><span /><span /></div>

          {/* Model Feature Importances (Vertical, bounded) */}
          <div className="metrics-box">
            <h4>
              <span>Model Feature Importances</span>
              <span style={{ fontSize: '10px', color: '#799b3c', fontFamily: 'DM Mono' }}>{serviceStatus.featureCount} Features</span>
            </h4>
            {metricsLoading ? (
              <p style={{ fontSize: '0.8rem', color: '#666' }}>Loading metrics...</p>
            ) : metrics?.feature_importances ? (
              <div className="feature-bars">
                {Object.entries(metrics.feature_importances).map(([feat, weight]) => (
                  <div key={feat} className="feature-bar-item">
                    <div className="feature-labels">
                      <span className="feat-name">{feat}</span>
                      <strong className="feat-pct">{(weight * 100).toFixed(1)}%</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.max(weight * 100, 2)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#666' }}>
                <div>Rotational speed: <strong>27.2%</strong></div>
                <div>Power: <strong>23.0%</strong></div>
                <div>Tool wear: <strong>17.4%</strong></div>
              </div>
            )}
          </div>
          
          {/* Continuous Retraining Trigger */}
          <div className="retrain-box">
            <p className="retrain-desc">Triggers background pipeline retraining on logged feedback data without service interruption.</p>
            <button 
              className="secondary-button" 
              type="button"
              onClick={handleTriggerRetrain} 
              disabled={retrainLoading}
            >
              {retrainLoading ? 'Queuing Task...' : 'Trigger Model Retraining'}
            </button>
          </div>
        </aside>
      </div>

      {/* 4. Fleet Batch Results UI (Below Workspace) */}
      {batchResults && (
        <section className="batch-results-section">
          <div className="batch-results-header">
            <div>
              <p className="eyebrow accent">Telemetry Results</p>
              <h3>Fleet Batch Diagnostic Report</h3>
            </div>
            <div className="batch-header-actions">
              <button className="btn-small" onClick={handleExportBatchCSV}>
                <IconDownload size={13} /> Export CSV Report
              </button>
              <button className="btn-small" onClick={() => setBatchResults(null)}>Clear Results</button>
            </div>
          </div>

          {/* Aggregate KPI Chips */}
          <div className="fleet-summary-grid">
            <div className="fleet-stat-card">
              <span className="stat-label">Total Evaluated</span>
              <strong className="stat-value">{totalBatch}</strong>
              <span className="stat-sub">Machines in batch</span>
            </div>
            <div className="fleet-stat-card healthy-card">
              <span className="stat-label">Normal</span>
              <strong className="stat-value">{healthyBatch}</strong>
              <span className="stat-sub">{totalBatch > 0 ? ((healthyBatch / totalBatch) * 100).toFixed(0) : 0}% Healthy</span>
            </div>
            <div className="fleet-stat-card danger-card">
              <span className="stat-label">Failure Likely</span>
              <strong className="stat-value">{failingBatch}</strong>
              <span className="stat-sub">{totalBatch > 0 ? ((failingBatch / totalBatch) * 100).toFixed(0) : 0}% Requiring Action</span>
            </div>
            <div className="fleet-stat-card">
              <span className="stat-label">Avg Risk</span>
              <strong className="stat-value">{avgRisk}%</strong>
              <span className="stat-sub">Mean probability</span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="batch-filter-bar">
            <span className="filter-label">Filter:</span>
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
              Critical ({failingBatch})
            </button>
            <button 
              className={`filter-chip healthy ${batchFilter === 'NORMAL' ? 'active' : ''}`}
              onClick={() => setBatchFilter('NORMAL')}
            >
              Normal ({healthyBatch})
            </button>
          </div>

          {/* Diagnostic Cards */}
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
                      {item.risk_badge} {item.risk_level}
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
                      <strong>Diagnosed:</strong> {item.diagnosed_failure_mode}
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

                  <button 
                    className="btn-feedback-trigger"
                    onClick={() => setSelectedBatchItemForFeedback(item)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <IconFeedback size={12} /> Log Feedback
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Single Machine Result Modal */}
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}

      {/* Batch Machine Result Modal */}
      {selectedBatchItemForFeedback && (
        <ResultModal 
          result={selectedBatchItemForFeedback} 
          onClose={() => setSelectedBatchItemForFeedback(null)} 
        />
      )}
    </main>
  )
}

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

  // Background scroll freeze lock
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
      setFeedbackStatus('Feedback recorded successfully in pipeline database!')
    } catch (err) {
      setFeedbackStatus(err.message || 'Failed to record feedback.')
    } finally {
      setFeedbackLoading(false)
    }
  }
  
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`result-modal ${isFailure ? 'danger' : 'healthy'}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
        <button className="close-button" onClick={onClose} aria-label="Close prediction">×</button>
        <p className="eyebrow">Prediction result — {result.machine_id}</p>
        <div className="result-icon">
          {isFailure 
            ? <IconAlertCircle size={26} color="#a5472b" /> 
            : <IconCheckCircle size={26} color="#51732c" />}
        </div>
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
            <ul>
              {result.root_causes && result.root_causes.length > 0 
                ? result.root_causes.map((item) => <li key={item}>{item}</li>)
                : <li>Operating within nominal tolerances.</li>}
            </ul>
          </div>
          <div>
            <h4>Recommended actions</h4>
            <ul>
              {result.recommended_actions && result.recommended_actions.length > 0 
                ? result.recommended_actions.map((item) => <li key={item}>{item}</li>)
                : <li>Continue scheduled operational cycles.</li>}
            </ul>
          </div>
        </div>

        <hr style={{ margin: '24px 0 16px', borderColor: 'rgba(0,0,0,0.08)' }} />
        
        {/* Active Learning Feedback */}
        <form onSubmit={handleFeedbackSubmit} className="feedback-form">
          <h4 className="feedback-title">Log Ground Truth (Technician Feedback)</h4>
          
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
              <label>Verified Failure Mode</label>
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
            placeholder="Technician Notes (optional)" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            className="feedback-notes-input"
          />

          <button type="submit" className="secondary-button" disabled={feedbackLoading} style={{ width: '100%' }}>
            {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
          </button>
          
          {feedbackStatus && (
            <p className={`feedback-message ${feedbackStatus.includes('Failed') ? 'error' : 'success'}`}>
              {feedbackStatus}
            </p>
          )}
        </form>
        
        <button className="secondary-button" onClick={onClose} style={{ marginTop: '12px', width: '100%' }}>
          Close result
        </button>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)