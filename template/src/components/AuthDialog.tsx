import React, { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '../supabase/client'
import { useAuth, type AuthMode } from './AuthProvider'

function explain(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/already registered|already been registered/i.test(message)) {
    return 'An account with that email already exists. Log in instead.'
  }
  if (/email rate limit|over_email_send_rate_limit/i.test(message)) {
    return 'Supabase paused confirmation emails after too many signups. Wait about an hour, then try again. If this email is already registered, use Log in.'
  }
  if (/email not confirmed/i.test(message)) return 'Confirm your email, then log in.'
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return `${message} Run template/supabase/schema.sql in the Supabase SQL editor, then refresh.`
  }
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the server. Check your connection and try again.'
  return message
}

export const AuthDialog: React.FC = () => {
  const { configured, dialogOpen, mode, openAuth, closeAuth, pushToast } = useAuth()
  const titleId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<'sign-in' | 'sign-up' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'sign-in' | 'sign-up' | null>(null)
  pendingRef.current = pending

  useEffect(() => {
    if (!dialogOpen) return
    setError('')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => emailRef.current?.focus())
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) closeAuth()
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = panelRef.current.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
    }
  }, [dialogOpen, closeAuth])

  if (!dialogOpen) return null

  const fail = (message: string) => {
    setError(message)
    pushToast('error', message)
  }

  const validate = (next: AuthMode): string => {
    if (next === 'sign-up' && name.trim().length === 0) return 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email.'
    if (password.length < 6) return 'Use at least 6 characters for the password.'
    return ''
  }

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = validate('sign-in')
    if (problem) {
      fail(problem)
      return
    }
    if (!supabase) {
      fail('Add the Supabase URL and publishable key, then refresh.')
      return
    }
    setPending('sign-in')
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setPending(null)
    if (signInError) {
      fail(explain(signInError.message))
      return
    }
    pushToast('success', 'Signed in')
    closeAuth()
  }

  const signUp = async () => {
    const problem = validate('sign-up')
    if (problem) {
      fail(problem)
      return
    }
    if (!supabase) {
      fail('Add the Supabase URL and publishable key, then refresh.')
      return
    }
    setPending('sign-up')
    setError('')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim(), phone: phone.trim() } },
    })
    if (signUpError && /email rate limit|over_email_send_rate_limit/i.test(`${signUpError.message} ${signUpError.code ?? ''}`)) {
      const existing = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      setPending(null)
      if (!existing.error && existing.data.session) {
        pushToast('success', 'Signed in to the account that was already created.')
        closeAuth()
        return
      }
      fail(explain(signUpError.message))
      return
    }
    setPending(null)
    if (signUpError) {
      fail(explain(signUpError.message))
      return
    }
    if (data.session) {
      pushToast('success', 'Account created. The first account in an empty project is the admin.')
      closeAuth()
      return
    }
    const message = 'Account created. Confirm the email, then log in.'
    setError('')
    pushToast('success', message)
    setPassword('')
    openAuth('sign-in')
  }

  const switchMode = (next: AuthMode) => {
    if (pending) return
    setError('')
    openAuth(next)
  }

  return (
    <div className="safi-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) closeAuth()
    }}>
      <div
        className="safi-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="safi-modal-head">
          <h2 id={titleId}>{mode === 'sign-in' ? 'Log in' : 'Create account'}</h2>
          <button type="button" className="safi-modal-close" aria-label="Close" onClick={closeAuth} disabled={Boolean(pending)}>
            ×
          </button>
        </div>
        <div className="safi-auth-switch" role="tablist" aria-label="Account">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} onClick={() => switchMode('sign-in')} disabled={Boolean(pending)}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} onClick={() => switchMode('sign-up')} disabled={Boolean(pending)}>
            Sign up
          </button>
        </div>
        {!configured ? (
          <p className="safi-error">Add the Supabase URL and publishable key, then refresh.</p>
        ) : null}
        <form
          className="safi-form"
          onSubmit={(event) => {
            if (mode === 'sign-up') {
              event.preventDefault()
              void signUp()
              return
            }
            void signIn(event)
          }}
        >
          {mode === 'sign-up' ? (
            <>
              <label className="safi-field">
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" disabled={Boolean(pending)} />
              </label>
              <label className="safi-field">
                Phone
                <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" disabled={Boolean(pending)} />
              </label>
            </>
          ) : null}
          <label className="safi-field">
            Email
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={Boolean(pending)}
            />
          </label>
          <label className="safi-field">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              disabled={Boolean(pending)}
            />
          </label>
          {error ? <p className="safi-error">{error}</p> : null}
          <div className="safi-form-actions">
            {mode === 'sign-in' ? (
              <button className="safi-button" type="submit" disabled={Boolean(pending)}>
                {pending === 'sign-in' ? <span className="safi-spinner" aria-hidden="true" /> : null}
                {pending === 'sign-in' ? 'Signing in' : 'Log in'}
              </button>
            ) : (
              <button className="safi-button" type="button" onClick={signUp} disabled={Boolean(pending)}>
                {pending === 'sign-up' ? <span className="safi-spinner" aria-hidden="true" /> : null}
                {pending === 'sign-up' ? 'Creating account' : 'Create account'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
