import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'

export type AuthMode = 'sign-in' | 'sign-up'

export interface ToastItem {
  id: number
  tone: 'success' | 'error'
  message: string
}

interface AuthContextValue {
  configured: boolean
  session: Session | null
  refreshKey: number
  refresh: () => void
  mode: AuthMode
  dialogOpen: boolean
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  signOut: () => Promise<void>
  toasts: ToastItem[]
  pushToast: (tone: ToastItem['tone'], message: string) => void
  dismissToast: (id: number) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const pushToast = useCallback(
    (tone: ToastItem['tone'], message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((current) => [...current, { id, tone, message }].slice(-3))
      window.setTimeout(() => dismissToast(id), tone === 'error' ? 6500 : 4200)
    },
    [dismissToast],
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const openAuth = useCallback((next: AuthMode = 'sign-in') => {
    setMode(next)
    setDialogOpen(true)
  }, [])

  const closeAuth = useCallback(() => setDialogOpen(false), [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      pushToast('error', error.message)
      return
    }
    pushToast('success', 'Signed out')
  }, [pushToast])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: Boolean(supabase),
      session,
      refreshKey,
      refresh: () => setRefreshKey((current) => current + 1),
      mode,
      dialogOpen,
      openAuth,
      closeAuth,
      signOut,
      toasts,
      pushToast,
      dismissToast,
    }),
    [session, refreshKey, mode, dialogOpen, openAuth, closeAuth, signOut, toasts, pushToast, dismissToast],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      <div className="safi-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className={`safi-toast safi-toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <span className="safi-toast-badge">{toast.tone === 'error' ? 'Error' : 'Done'}</span>
            <span>{toast.message}</span>
            <button type="button" className="safi-toast-dismiss" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
              ×
            </button>
          </p>
        ))}
      </div>
    </AuthContext.Provider>
  )
}
