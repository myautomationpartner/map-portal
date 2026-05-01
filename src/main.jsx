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
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 50% -12%,rgba(112,228,255,.22),transparent 33rem),linear-gradient(180deg,#07090f,#0f1320);">
        <div style="max-width:760px;width:100%;background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.04)),rgba(12,16,29,.86);border:1px solid rgba(255,255,255,.14);border-radius:24px;box-shadow:0 30px 90px rgba(0,0,0,.48);padding:24px;color:#dbe3f4;font-family:system-ui,sans-serif;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#70e4ff;">Portal Boot Failure</p>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;">${String(error?.stack || error?.message || error)}</pre>
        </div>
      </div>
    `
  }
}
