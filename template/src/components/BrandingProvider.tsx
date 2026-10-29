import { createContext, useContext } from 'react'
import type { InstanceConfig } from '../config'

export type BrandingConfig = InstanceConfig

const BrandingContext = createContext<BrandingConfig | undefined>(undefined)

export const BrandingProvider = BrandingContext.Provider

export const useBranding = (): BrandingConfig => {
  const result = useContext(BrandingContext)
  if (!result) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return result
}
