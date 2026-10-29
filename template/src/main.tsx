import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

async function loadExample() {
  const example = new URLSearchParams(window.location.search).get('example')
  if (!example || !/^[a-z0-9-]+$/.test(example)) return
  const response = await fetch(`/examples/${example}.json`)
  if (!response.ok) return
  ;(window as Window & { __SAFI_CONFIG__?: unknown }).__SAFI_CONFIG__ = await response.json()
}

loadExample().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})