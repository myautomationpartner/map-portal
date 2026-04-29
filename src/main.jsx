import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root')

try {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (error) {
  console.error('Portal boot failure:', error)

  if (rootElement) {
    rootElement.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
        <div style="max-width:760px;width:100%;background:#fff;border:1px solid rgba(109,115,196,.18);border-radius:24px;box-shadow:0 20px 60px rgba(73,86,180,.14);padding:24px;color:#1f275c;font-family:system-ui,sans-serif;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#8b94bd;">Portal Boot Failure</p>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;">${String(error?.stack || error?.message || error)}</pre>
        </div>
      </div>
    `
  }
}
