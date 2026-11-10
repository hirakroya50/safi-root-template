import { expect, test } from '@playwright/test'

test('lotus chat sends, shows a failure, retries, and clears', async ({ page }) => {
  let calls = 0
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { message?: string; conversationId?: string }
    calls += 1
    if (body.message === 'shift check') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'should not appear', conversationId: '11111111-1111-4111-8111-111111111111' }),
      })
      return
    }
    if (calls === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'We keep monthly books for shops.',
          conversationId: '11111111-1111-4111-8111-111111111111',
        }),
      })
      return
    }
    if (calls === 2) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'upstream', message: 'Lotus AI Chat could not answer just now. Try again.' },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: 'Recovered answer.',
        conversationId: body.conversationId,
      }),
    })
  })

  await page.goto('/?example=business')
  await expect(page.locator('h1')).toContainText('Fieldnote Studio')
  await page.getByRole('button', { name: 'Lotus AI Chat' }).click()
  await expect(page.getByRole('dialog', { name: 'Lotus AI Chat' })).toBeVisible()
  await expect(page.getByText('Ask me about Fieldnote Studio.')).toBeVisible()

  const input = page.getByRole('textbox', { name: 'Message Lotus AI Chat' })
  await input.fill('shift check')
  await input.press('Shift+Enter')
  await page.waitForTimeout(300)
  expect(calls).toBe(0)

  await input.fill('What services do you offer?')
  await input.press('Enter')
  await expect(page.getByText('We keep monthly books for shops.')).toBeVisible()
  await expect(page.getByText('What services do you offer?')).toBeVisible()

  await input.fill('What are your hours?')
  const send = page.getByRole('button', { name: 'Send' })
  await send.click()
  await expect(page.getByText('Lotus AI Chat is typing')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('could not answer')

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Recovered answer.')).toBeVisible()

  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(page.getByText('We keep monthly books for shops.')).toHaveCount(0)
  await expect(page.getByText('Ask me about Fieldnote Studio.')).toBeVisible()
})

test('lotus chat stays usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?example=coffee')
  const launcher = page.getByRole('button', { name: 'Lotus AI Chat' })
  await expect(launcher).toBeVisible()
  await launcher.click()
  const panel = page.getByRole('dialog', { name: 'Lotus AI Chat' })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box?.width ?? 0).toBeLessThanOrEqual(390)
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(0)
})
