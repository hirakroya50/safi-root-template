import React, {
  createContext,
  useContext,
  ReactNode
} from 'react'

export interface Palette {
  primary: string
  background: string
}

export interface BrandingConfig {
  appId: string
  displayName: string
  subtitle: string
  palette: Palette
}

const BrandingContext = createContext<BrandingConfig | undefined>(undefined)

export const BrandingProvider = BrandingContext.Provider

export const useBranding = (): BrandingConfig => {
  const result = useContext(BrandingContext)
  if (!result) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return result
}