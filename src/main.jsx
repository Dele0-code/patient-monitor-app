import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted fonts (bundled into dist) — the Pi kiosk is LAN-only, so pulling
// these from fonts.googleapis.com blocked text render on every boot until the
// request timed out. These imports ship the woff2 with the build instead.
import '@fontsource/roboto-mono/400.css'
import '@fontsource/roboto-mono/700.css'
import '@fontsource/share-tech-mono/400.css'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
)
