import React, { useEffect } from 'react'
import { BrandingProvider } from './components/BrandingProvider'
import { ChatPane } from './components/ChatPane'
import { SiteHeader } from './components/SiteHeader'
import { Workspace } from './components/Workspace'
import { readConfig, themeVars } from './config'

const App: React.FC = () => {
  const config = readConfig()

  useEffect(() => {
    document.title = config.displayName
  }, [config.displayName])

  return (
    <BrandingProvider value={config}>
      <div className="safi-app" style={themeVars(config.palette)}>
        <a className="safi-skip" href="#offerings">
          Skip to {config.sections.offerings.toLowerCase()}
        </a>
        <div className="safi-sticky">
          <p className="safi-template-banner">
            <span>This is a template UI</span>
            <span className="safi-template-company">Lotus AI Works Inc.</span>
          </p>
          <SiteHeader />
        </div>
        <div className="safi-frame">
          <main className="safi-main" id="top">
            <section className="safi-hero">
              <p className="safi-kicker">{config.subtitle}</p>
              <h1>{config.displayName}</h1>
              <p className="safi-intro">{config.intro}</p>
              <a className="safi-action" href={config.primaryAction.href}>
                {config.primaryAction.label}
              </a>
            </section>

            {config.highlights.length > 0 ? (
              <dl className="safi-highlights">
                {config.highlights.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <Workspace />

            <section className="safi-about" id="about" aria-labelledby="about-title">
              <h2 id="about-title">{config.sections.about}</h2>
              <p>{config.about}</p>
            </section>

            <section className="safi-contact" id="contact" aria-labelledby="contact-title">
              <h2 id="contact-title">{config.sections.contact}</h2>
              {config.contact.length === 0 ? (
                <p className="safi-empty">Contact details from the configuration will show here.</p>
              ) : (
                <dl>
                  {config.contact.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>
                        {item.href ? <a href={item.href}>{item.value}</a> : item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </main>
          <aside className="safi-branding">
            <ChatPane />
          </aside>
        </div>
        <p className="safi-colophon">Template UI by Lotus AI Works Inc.</p>
      </div>
    </BrandingProvider>
  )
}

export default App
