import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initAeBridge, isAePanel } from './ae/bridge.js'

class BootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ftrack] render crash', error, info)
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.stack || this.state.error?.message || String(this.state.error)
      return (
        <div style={{
          padding: 16,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          color: '#f88',
          background: '#1a1d21',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          height: '100%',
          overflow: 'auto',
        }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Panel crashed</div>
          {msg}
        </div>
      )
    }
    return this.props.children
  }
}

function showFatal(err) {
  const root = document.getElementById('root')
  if (!root) return
  const msg = err?.stack || err?.message || String(err)
  root.innerHTML = `<div style="padding:16px;font-family:monospace;font-size:12px;color:#f88;background:#1a1d21;white-space:pre-wrap">${msg.replace(/</g, '&lt;')}</div>`
}

window.addEventListener('error', (e) => {
  console.error('[ftrack] window error', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[ftrack] unhandledrejection', e.reason)
})

async function boot() {
  if (isAePanel()) {
    try {
      await initAeBridge()
    } catch (e) {
      console.warn('[ae] bridge init failed', e)
    }
  }

  try {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <BootErrorBoundary>
          <App />
        </BootErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    showFatal(e)
    throw e
  }
}

boot().catch(showFatal)
