import React, { useEffect, useState } from 'react'
import { monogram } from '../config'
import { useAuth } from './AuthProvider'
import { useBranding } from './BrandingProvider'

function accountLabel(session: { user: { email?: string; user_metadata?: Record<string, unknown> } }): string {
  const name = session.user.user_metadata?.name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return session.user.email || 'Account'
}

export const SiteHeader: React.FC = () => {
  const config = useBranding()
  const { session, dialogOpen, openAuth, signOut } = useAuth()
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
      </nav>
      <div className="safi-header-actions">
        {session ? (
          <>
            <span className="safi-account-name">{accountLabel(session)}</span>
            <button type="button" className="safi-button safi-button-quiet" onClick={() => void signOut()}>
              Log out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="safi-button safi-button-quiet"
            aria-haspopup="dialog"
            aria-expanded={dialogOpen}
            onClick={() => openAuth('sign-in')}
          >
            Log in
          </button>
        )}
        <a className="safi-action" href={config.primaryAction.href}>
          {config.primaryAction.label}
        </a>
      </div>
    </header>
  )
}
