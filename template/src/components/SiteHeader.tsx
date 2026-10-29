import React, { useEffect, useState } from 'react'
import { monogram } from '../config'
import { useBranding } from './BrandingProvider'

export const SiteHeader: React.FC = () => {
  const config = useBranding()
  const [hash, setHash] = useState(() => window.location.hash || '#top')

  useEffect(() => {
    const sync = () => setHash(window.location.hash || '#top')
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return (
    <header className="safi-header">
      <a className="safi-brand" href="#top" data-safi-id={config.appId}>
        <span className="safi-monogram" aria-hidden="true">
          {monogram(config.displayName)}
        </span>
        <span className="safi-wordmark">{config.displayName}</span>
      </a>
      <nav className="safi-nav" aria-label="Primary">
        {config.navigation.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={hash === item.href ? 'true' : undefined}
          >
            {item.label}
          </a>
        ))}
        <a href="#desk" aria-current={hash === '#desk' ? 'true' : undefined}>
          Account
        </a>
      </nav>
      <a className="safi-action" href={config.primaryAction.href}>
        {config.primaryAction.label}
      </a>
    </header>
  )
}
