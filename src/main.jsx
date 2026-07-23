import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initAeBridge, isAePanel } from './ae/bridge.js'

async function boot() {
  if (isAePanel()) {
    try {
      await initAeBridge()
    } catch (e) {
      console.warn('[ae] bridge init failed', e)
    }
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
