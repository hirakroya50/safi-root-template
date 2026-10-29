import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

const example = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'examples', `${name}.json`), 'utf8'))

// Helper: set the global config that the App reads from window.__SAFI_CONFIG__
const setupConfig = (config: { appId: string; displayName: string; subtitle: string; palette: { primary: string; background: string } }) => {
  test.addInfo?.('safiConfig', config)
}

test.beforeEach(() => {
  // No-op; tests set config via window.__SAFI_CONFIG__ manually
})

test('renders SAFI root template with business config', async ({ page }) => {
  // Set the global config that App reads
  await page.addInitScript((config) => {
    ;(window as any).__SAFI_CONFIG__ = config
  }, {
    appId: 'safi-business-001',
    displayName: 'SAFI Business',
    subtitle: 'Manage your business operations',
    palette: { primary: '#10b981', background: '#f8fafc' }
  })
  await page.goto('/')
  // Header should display the branding
  await expect(page.locator('h1')).toContainText('SAFI Business')
  await expect(page.locator('.safi-kicker')).toContainText('Manage your business operations')
  // Workspace placeholder should be visible
  await expect(page.locator('.safi-workspace-placeholder')).toBeVisible()
  // Footer chat pane should be labeled as demo
  await expect(page.locator('.safi-chat-label')).toContainText('Demo Chat')
})

test('renders SAFI root template with career config', async ({ page }) => {
  await page.addInitScript((config) => {
    ;(window as any).__SAFI_CONFIG__ = config
  }, {
    appId: 'safi-career-001',
    displayName: 'SAFI Career',
    subtitle: 'Explore career opportunities',
    palette: { primary: '#3b82f6', background: '#f8fafc' }
  })
  await page.goto('/')
  // Header should display the career branding
  await expect(page.locator('h1')).toContainText('SAFI Career')
  await expect(page.locator('.safi-kicker')).toContainText('Explore career opportunities')
  // Workspace placeholder should be visible
  await expect(page.locator('.safi-workspace-placeholder')).toBeVisible()
  // Footer chat pane should be labeled as demo
  await expect(page.locator('.safi-chat-label')).toContainText('Demo Chat')
})

test('rejects invalid configuration', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).__SAFI_CONFIG__ = {
      appId: 'bad-config',
      displayName: 'Still standing',
      subtitle: 'Unsafe fields are dropped',
      palette: { primary: '#243044', background: '#f6f4f0' },
      primaryAction: { label: 'Run', href: 'javascript:alert(1)' },
      contact: [{ label: 'Script', value: 'nope', href: 'javascript:alert(1)' }],
      surprise: true
    }
  })
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Still standing')
  await expect(page.locator('.safi-action').first()).toHaveAttribute('href', '#contact')
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
})

test('navigation works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('This is a template UI')).toBeVisible()
  await expect(page.getByText('Lotus AI Works Inc.').first()).toBeVisible()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Menu' }).click()
  await expect(page).toHaveURL(/#offerings/)
  await expect(page.locator('#offerings')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'House espresso' })).toBeVisible()
})

test('refresh preserves config', async ({ page }) => {
  // Set business config first
  await page.addInitScript((config) => {
    ;(window as any).__SAFI_CONFIG__ = config
  }, {
    appId: 'safi-business-001',
    displayName: 'SAFI Business',
    subtitle: 'Manage your business operations',
    palette: { primary: '#10b981', background: '#f8fafc' }
  })
  await page.goto('/')
  // Note current heading text
  const headingBefore = await page.locator('h1').innerText()
  // Refresh the page
  await page.reload()
  // Heading should persist after refresh
  const headingAfter = await page.locator('h1').innerText()
  await expect(headingAfter).toBe(headingBefore)
})

test('deep link works', async ({ page }) => {
  await page.addInitScript((config) => {
    ;(window as any).__SAFI_CONFIG__ = config
  }, {
    appId: 'safi-career-001',
    displayName: 'SAFI Career',
    subtitle: 'Explore career opportunities',
    palette: { primary: '#3b82f6', background: '#f8fafc' }
  })
  await page.goto('/#contact')
  await expect(page.locator('h1')).toContainText('SAFI Career')
  await expect(page.locator('.safi-brand')).toBeVisible()
  await expect(page).toHaveURL(/#contact/)
  await expect(page.locator('#contact')).toBeVisible()
})

test('responsive layout - mobile', async ({ page }) => {
  await page.goto('/')
  // Set viewport to mobile width
  await page.setViewportSize({ width: 375, height: 667 })
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('.safi-workspace-placeholder')).toBeVisible()
  const main = await page.locator('.safi-main').boundingBox()
  const brand = await page.locator('.safi-branding').boundingBox()
  expect(brand?.y).toBeGreaterThan((main?.y ?? 0) + (main?.height ?? 0) - 1)
})

test('responsive layout - desktop', async ({ page }) => {
  await page.goto('/')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('.safi-workspace-placeholder')).toBeVisible()
  const main = await page.locator('.safi-main').boundingBox()
  const brand = await page.locator('.safi-branding').boundingBox()
  expect(brand?.x).toBeGreaterThan(main?.x ?? 0)
})

const clients: Array<[string, string, string, string]> = [
  ['coffee shop', 'coffee', 'House espresso', 'Menu'],
  ['grocery shop', 'grocery', "This week's vegetables", 'Aisles'],
  ['individual person', 'person', 'Pike to the water', 'Walks'],
  ['self-owned business', 'business', 'Books in order', 'Services'],
  ['independent practice', 'career', 'Field notes', 'Selected work'],
]

for (const [kind, file, offering, section] of clients) {
  test(`renders a ${kind} from shared configuration`, async ({ page }) => {
    const config = example(file)
    await page.addInitScript((injected) => {
      ;(window as any).__SAFI_CONFIG__ = injected
    }, config)
    await page.goto('/')
    await expect(page.locator('h1')).toContainText(config.displayName)
    await expect(page.locator('.safi-kicker')).toContainText(config.subtitle)
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: offering })).toBeVisible()
    await expect(page.locator('.safi-chat-label')).toContainText('Demo Chat')
    await expect(page.locator('#safi-chat-input')).toBeDisabled()
  })
}