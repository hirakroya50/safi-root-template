import type { CSSProperties } from 'react'

export interface Palette {
  primary: string
  background: string
}

export interface NavLink {
  label: string
  href: '#top' | '#offerings' | '#about' | '#contact'
}

export interface Highlight {
  label: string
  value: string
}

export interface Offering {
  meta?: string
  title: string
  detail: string
}

export interface ContactItem {
  label: string
  value: string
  href?: string
}

export interface InstanceConfig {
  appId: string
  displayName: string
  subtitle: string
  palette: Palette
  intro: string
  about: string
  navigation: NavLink[]
  sections: {
    offerings: string
    about: string
    contact: string
  }
  highlights: Highlight[]
  offerings: Offering[]
  contact: ContactItem[]
  primaryAction: NavLink
}

const PAGE_LINKS = ['#top', '#offerings', '#about', '#contact'] as const
const SAFE_HREF =
  /^(#(top|offerings|about|contact)|mailto:[^\s@]+@[^\s@]+\.[^\s@]+|tel:\+?[0-9][0-9().\- ]{2,20})$/

const sample: InstanceConfig = {
  appId: 'hearth-and-rye',
  displayName: 'Hearth & Rye',
  subtitle: 'Neighborhood coffee bar',
  palette: { primary: '#F15A24', background: '#FFF6EE' },
  intro:
    'Espresso roasted in small lots, a short pastry list, and a room quiet enough to stay awhile.',
  about:
    'Hearth & Rye is a single room on Pine Street. We roast two days a week, bake what we can sell in a morning, and leave the rest of the day unhurried.',
  navigation: [
    { label: 'Menu', href: '#offerings' },
    { label: 'The bar', href: '#about' },
    { label: 'Visit', href: '#contact' },
  ],
  sections: { offerings: 'Menu', about: 'The bar', contact: 'Visit' },
  highlights: [
    { label: 'Hours', value: 'Daily, 7–3' },
    { label: 'Since', value: '2016' },
    { label: 'Room', value: '32 seats' },
  ],
  offerings: [
    {
      meta: 'Espresso',
      title: 'House espresso',
      detail: 'Chocolate, citrus, and a clean finish. Served as a short or long pull.',
    },
    {
      meta: 'Brew',
      title: 'Batch filter',
      detail: 'One coffee on the brew bar each morning, changed when the pot runs out.',
    },
    {
      meta: 'Milk',
      title: 'Oat cortado',
      detail: 'Equal parts espresso and steamed oat milk, lightly sweet.',
    },
    {
      meta: 'Pastry',
      title: 'Morning bun',
      detail: 'Laminated dough, orange sugar, baked before open.',
    },
  ],
  contact: [
    { label: 'Address', value: '418 Pine Street' },
    { label: 'Hours', value: 'Every day, 7am–3pm' },
    { label: 'Phone', value: '(206) 555-0148', href: 'tel:+12065550148' },
  ],
  primaryAction: { label: 'Plan a visit', href: '#contact' },
}

export const defaultConfig: InstanceConfig = sample

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, max)
}

function pageHref(value: unknown): NavLink['href'] | undefined {
  return typeof value === 'string' && PAGE_LINKS.includes(value as NavLink['href'])
    ? (value as NavLink['href'])
    : undefined
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const href = value.trim()
  return SAFE_HREF.test(href) ? href : undefined
}

function readNav(value: unknown): NavLink[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 4).flatMap((item) => {
    if (!isRecord(item)) return []
    const href = pageHref(item.href)
    const label = text(item.label, 32)
    return href && label ? [{ label, href }] : []
  })
}

export function monogram(name: string): string {
  const words = name.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word))
  if (words.length === 0) return 'SA'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

export function normalizeConfig(value: unknown): InstanceConfig {
  const raw = isRecord(value) ? value : {}
  const palette = isRecord(raw.palette) ? raw.palette : {}
  const sectionRaw = isRecord(raw.sections) ? raw.sections : {}
  const sections = {
    offerings: text(sectionRaw.offerings, 32, 'Offerings'),
    about: text(sectionRaw.about, 32, 'About'),
    contact: text(sectionRaw.contact, 32, 'Contact'),
  }
  const displayName = text(raw.displayName, 80, defaultConfig.displayName)
  const subtitle = text(raw.subtitle, 120, defaultConfig.subtitle)
  const intro = text(raw.intro, 280, subtitle)
  const navigation = readNav(raw.navigation)
  const action = isRecord(raw.primaryAction) ? raw.primaryAction : {}
  const actionHref = pageHref(action.href)

  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.slice(0, 3).flatMap((item) => {
        if (!isRecord(item)) return []
        const label = text(item.label, 24)
        const fact = text(item.value, 40)
        return label && fact ? [{ label, value: fact }] : []
      })
    : []

  const offerings = Array.isArray(raw.offerings)
    ? raw.offerings.slice(0, 12).flatMap((item) => {
        if (!isRecord(item)) return []
        const title = text(item.title, 60)
        const detail = text(item.detail, 180)
        const meta = text(item.meta, 32)
        if (!title || !detail) return []
        return [{ title, detail, ...(meta ? { meta } : {}) }]
      })
    : []

  const contact = Array.isArray(raw.contact)
    ? raw.contact.slice(0, 6).flatMap((item) => {
        if (!isRecord(item)) return []
        const label = text(item.label, 24)
        const contactValue = text(item.value, 80)
        if (!label || !contactValue) return []
        const href = safeHref(item.href)
        return [{ label, value: contactValue, ...(href ? { href } : {}) }]
      })
    : []

  return {
    appId: text(raw.appId, 64, defaultConfig.appId),
    displayName,
    subtitle,
    palette: {
      primary: text(palette.primary, 40, defaultConfig.palette.primary),
      background: text(palette.background, 40, defaultConfig.palette.background),
    },
    intro,
    about: text(raw.about, 700, intro),
    navigation: navigation.length
      ? navigation
      : [
          { label: sections.offerings, href: '#offerings' },
          { label: sections.about, href: '#about' },
          { label: sections.contact, href: '#contact' },
        ],
    sections,
    highlights,
    offerings,
    contact,
    primaryAction: {
      label: text(action.label, 32, 'Get in touch'),
      href: actionHref ?? '#contact',
    },
  }
}

export function readConfig(): InstanceConfig {
  const injected = (window as Window & { __SAFI_CONFIG__?: unknown }).__SAFI_CONFIG__
  if (injected === undefined) return defaultConfig
  return normalizeConfig(injected)
}

interface RGB {
  r: number
  g: number
  b: number
}

const NAMED: Record<string, RGB> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  navy: { r: 0, g: 0, b: 128 },
  green: { r: 0, g: 128, b: 0 },
  brown: { r: 107, g: 62, b: 38 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
}

function parseColor(input: string): RGB | null {
  const value = input.trim().toLowerCase()
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split('').map((part) => part + part).join('') : hex[1]
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    }
  }
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  return NAMED[value] ?? null
}

function luminance(color: RGB): number {
  const channel = (part: number) => {
    const srgb = part / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

function mix(base: RGB, target: RGB, amount: number): string {
  const blend = (from: number, to: number) => Math.round(from + (to - from) * amount)
  return `rgb(${blend(base.r, target.r)} ${blend(base.g, target.g)} ${blend(base.b, target.b)})`
}

export function themeVars(palette: Palette): CSSProperties {
  const background = parseColor(palette.background) ?? { r: 255, g: 246, b: 238 }
  const primary = parseColor(palette.primary) ?? { r: 241, g: 90, b: 36 }
  const light = luminance(background) > 0.45
  const ink = light ? '#1a1423' : '#fff7fb'
  const muted = light ? '#5b5366' : '#e7dbe3'
  const onPrimary = luminance(primary) > 0.62 ? '#1a1423' : '#ffffff'
  const paper = light ? { r: 255, g: 255, b: 255 } : { r: 42, g: 16, b: 36 }

  return {
    '--safi-primary': palette.primary,
    '--safi-background': palette.background,
    '--safi-on-background': ink,
    '--safi-muted': muted,
    '--safi-on-primary': onPrimary,
    '--safi-surface': mix(background, paper, 0.9),
    '--safi-line': light ? 'rgba(225, 29, 111, 0.16)' : 'rgba(255, 247, 251, 0.18)',
    '--safi-tint': `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.2)`,
    '--safi-header': `rgba(${background.r}, ${background.g}, ${background.b}, 0.92)`,
  } as CSSProperties
}
