import React from 'react'
import { BrandingProvider } from './components/BrandingProvider'

// Read configuration from global set by test infrastructure (falls back to defaults)
const globalConfig: {
  appId: string
  displayName: string
  subtitle: string
  palette: { primary: string; background: string }
} | undefined = (window as any).__SAFI_CONFIG__

const App: React.FC = () => {
  const config = globalConfig || {
    appId: 'safi-root-template',
    displayName: 'SAFI Root Template',
    subtitle: 'A reusable root SPA template',
    palette: { primary: '#3b82f6', background: '#f8fafc' }
  }

  return (
    <BrandingProvider value={config}>
      <div className="safi-app">
        <header className="safi-header">
          <h1>{config.displayName}</h1>
          <p>{config.subtitle}</p>
        </header>
        <main className="safi-main">
          <section className="safi-branding">
            <div className="safi-brand" style={{
              color: config.palette.primary,
              background: config.palette.background
            }}>
              <span data-safi-id={config.appId}>SAFI App</span>
            </div>
          </section>
          <section className="safi-workspace">
            <div className="safi-workspace-placeholder">
              Workspace/Artifact placeholder
            </div>
          </section>
        </main>
        <footer className="safi-footer">
          <div className="safi-chat-pane" data-safi-chat>
            <span className="safi-chat-label">
              Demo Chat (nonfunctional)
            </span>
          </div>
        </footer>
      </div>
    </BrandingProvider>
  )
}

export default App