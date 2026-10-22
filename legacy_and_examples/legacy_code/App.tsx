import { useState } from 'react'
import TestScenarios from './TestScenarios'
import './App.css'
import { DbConfig, GenerationConfig } from './types'

// Event types available in NPHIES system
const EVENT_TYPES = [
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A11',
  'A12',
  'A13',
  'A31',
  'A38',
  'A45',
  'A50',
  'DISCHARGE_SUMMARY',
  'OUTPATIENT_ENCOUNTER_SUMMARY',
  'OPERATIVE_NOTE',
  'NEWBORN_DISCHARGE',
  'MATERNAL_DISCHARGE',
  'LAB_ORDER',
  'LAB_RESULT',
  'MEDICATION_REQUEST',
  'MEDICATION_DISPENSE',
  'RADIOLOGY_ORDER',
  'RADIOLOGY_RESULT'
]

const DEFAULT_POSTGRES_CONFIG = {
  host: import.meta.env.VITE_POSTGRES_HOST || 'localhost',
  port: parseInt(import.meta.env.VITE_POSTGRES_PORT || '5432'),
  database: import.meta.env.VITE_POSTGRES_DATABASE || 'postgres',
  user: import.meta.env.VITE_POSTGRES_USER || 'postgres',
  password: import.meta.env.VITE_POSTGRES_PASSWORD || 'admin'
}

const DEFAULT_ORACLE_CONFIG = {
  host: import.meta.env.VITE_ORACLE_HOST || 'localhost',
  port: parseInt(import.meta.env.VITE_ORACLE_PORT || '1521'),
  database: import.meta.env.VITE_ORACLE_DATABASE || 'XE',
  user: import.meta.env.VITE_ORACLE_USER || 'system',
  password: import.meta.env.VITE_ORACLE_PASSWORD || 'oracle'
}

const DEFAULT_SQLSERVER_CONFIG = {
  host: import.meta.env.VITE_SQLSERVER_HOST || '172.16.10.6\\SQL2019',
  port: parseInt(import.meta.env.VITE_SQLSERVER_PORT || '1433'),
  database: import.meta.env.VITE_SQLSERVER_DATABASE || 'uhr_waseel',
  user: import.meta.env.VITE_SQLSERVER_USER || 'BADAL',
  password: import.meta.env.VITE_SQLSERVER_PASSWORD || 'badal'
}

function App() {
  // Database configuration state
  const [dbConfig, setDbConfig] = useState<DbConfig>({
    type: 'postgres',
    ...DEFAULT_POSTGRES_CONFIG
  })

  // Generation configuration state
  const [numberOfEvents, setNumberOfEvents] = useState<number>(5)
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([EVENT_TYPES[0]])
  const [providerType, setProviderType] = useState<'default' | 'default_auto' | 'enhanced' | 'enhanced_auto'>('default')

  // UI state
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [connectionMessage, setConnectionMessage] = useState<string>('')
  const [generationMessage, setGenerationMessage] = useState<string>('')
  const [showDbConfig, setShowDbConfig] = useState<boolean>(true)

  const handleTestConnection = async () => {
    setConnectionMessage('Testing connection...')
    try {
      const result = await window.dbApi.testConnection(dbConfig)
      setIsConnected(result.success)
      setConnectionMessage(result.message)
    } catch (error) {
      setIsConnected(false)
      setConnectionMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleGenerateData = async () => {
    if (!isConnected) {
      setGenerationMessage('Please test the database connection first.')
      return
    }

    if (selectedEventTypes.length === 0) {
      setGenerationMessage('Please select at least one event type.')
      return
    }

    setIsGenerating(true)
    setGenerationMessage('Generating data...')

    const config: GenerationConfig = {
      numberOfEvents,
      eventTypes: selectedEventTypes,
      providerType,
      dbConfig
    }

    try {
      const result = await window.dbApi.generateData(config)
      if (result.success) {
        setGenerationMessage(`${result.message}`)
      } else {
        setGenerationMessage(`${result.message}`)
      }
    } catch (error) {
      setGenerationMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEventTypeToggle = (eventType: string) => {
    setSelectedEventTypes(prev => {
      if (prev.includes(eventType)) {
        return prev.filter(et => et !== eventType)
      } else {
        return [...prev, eventType]
      }
    })
  }

  const handleSelectAllEventTypes = () => {
    setSelectedEventTypes([...EVENT_TYPES])
  }

  const handleDeselectAllEventTypes = () => {
    setSelectedEventTypes([])
  }

  return (
    <div className="app-container">
      <header>
        <h1>NPHIES Mock Data Generator</h1>
        {/* <p className="subtitle">Generate realistic test data for NPHIES healthcare system</p> */}
      </header>

      <main>
        {/* Database Configuration Section */}
        <section className="card">
          <div className="section-header" onClick={() => setShowDbConfig(!showDbConfig)}>
            <h2>Database Configuration</h2>
            <button className="toggle-btn">{showDbConfig ? '▼' : '▶'}</button>
          </div>

          {showDbConfig && (
            <div className="section-content">
              <div className="form-grid">
                <div className="form-group">
                  <label>Database Type:</label>
                  <select
                    value={dbConfig.type}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      if (newType === 'oracle') {
                        setDbConfig({ ...dbConfig, type: newType, ...DEFAULT_ORACLE_CONFIG })
                      } else if (newType === 'mssql') {
                        setDbConfig({ ...dbConfig, type: newType, ...DEFAULT_SQLSERVER_CONFIG })
                      } else {
                        setDbConfig({ ...dbConfig, type: newType, ...DEFAULT_POSTGRES_CONFIG })
                      }
                    }}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value="postgres">PostgreSQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="mssql">SQL Server</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Host:</label>
                  <input
                    type="text"
                    value={dbConfig.host}
                    onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                    placeholder="localhost"
                  />
                </div>

                <div className="form-group">
                  <label>Port:</label>
                  <input
                    type="number"
                    value={dbConfig.port}
                    onChange={(e) => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })}
                    placeholder={dbConfig.type === 'mssql' ? "1433" : "5432"}
                  />
                </div>

                <div className="form-group">
                  <label>{dbConfig.type === 'oracle' ? 'Service Name / SID:' : 'Database:'}</label>
                  <input
                    type="text"
                    value={dbConfig.database}
                    onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                    placeholder="nphies_db"
                  />
                </div>

                <div className="form-group">
                  <label>User:</label>
                  <input
                    type="text"
                    value={dbConfig.user}
                    onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                    placeholder="postgres"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Password:</label>
                  <input
                    type="password"
                    value={dbConfig.password}
                    onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                    placeholder="Enter password"
                  />
                </div>
              </div>

              <div className="button-group">
                <button
                  onClick={handleTestConnection}
                  className={`btn ${isConnected ? 'btn-success-connection' : 'btn-primary'}`}
                >
                  {isConnected ? '✓ Connected' : ' Test Connection'}
                </button>
              </div>

              {connectionMessage && (
                <div className={`message ${isConnected ? 'message-success' : 'message-error'}`}>
                  {connectionMessage}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Data Generation Section */}
        <section className="card">
          <div className="section-header">
            <h2>Data Generation Settings</h2>
          </div>

          <div className="section-content">
            <div className="form-group">
              <label>Number of Events to Generate:</label>
              <div className="number-input-group">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={numberOfEvents}
                  onChange={(e) => setNumberOfEvents(Math.max(1, parseInt(e.target.value) || 1))}
                />
                {/* <span className="input-hint">Between 1 and 1000 events</span> */}
              </div>
            </div>

            <div className="form-group">
              <label>Provider Type:</label>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as any)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="default">DEFAULT (with nphies_events table)</option>
                <option value="default_auto">DEFAULT_AUTO (timestamp-based, no events table)</option>
                <option value="enhanced">ENHANCED (with uhr_event table)</option>
                <option value="enhanced_auto">ENHANCED_AUTO (timestamp-based, no events table)</option>
              </select>
              {/* <span className="input-hint" style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem', display: 'block' }}>
                {providerType.endsWith('_auto')
                  ? '⚡ AUTO mode: No events table, uses created_date/updated_date for sync'
                  : '📋 Event-based mode: Uses events table (nphies_events or uhr_event)'}
              </span> */}
            </div>

            <div className="form-group">
              <div className="label-with-actions">
                <label>Select Event Types:</label>
                <div className="quick-actions">
                  <button onClick={handleSelectAllEventTypes} className="btn btn-primary btn-small">Select All</button>
                  <button onClick={handleDeselectAllEventTypes} className="btn btn-primary btn-small">Deselect All</button>
                </div>
              </div>

              <div className="checkbox-grid">
                {EVENT_TYPES.map(eventType => (
                  <label key={eventType} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedEventTypes.includes(eventType)}
                      onChange={() => handleEventTypeToggle(eventType)}
                    />
                    <span>{eventType}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="button-group">
              <button
                onClick={handleGenerateData}
                disabled={!isConnected || isGenerating || selectedEventTypes.length === 0}
                className="btn btn-primary btn-large"
              >
                {isGenerating ? 'Generating...' : 'Generate Data'}
              </button>
            </div>

            {generationMessage && (
              <div className={`message ${generationMessage.startsWith('✅') ? 'message-success' : 'message-info'}`}>
                {generationMessage}
              </div>
            )}
          </div>
        </section>

        {/* Test Scenarios Section */}
        <section className="card">
          <div className="section-header">
            <h2>Test scenarios</h2>
          </div>
          <div className="section-content">
            <TestScenarios dbConfig={dbConfig} isConnected={isConnected} />
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

