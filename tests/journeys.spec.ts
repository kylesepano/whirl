import { expect, test, type Page } from '@playwright/test'

const adminEmail = 'admin@whirl.example'
const adminPassword = 'playwright-local-admin'
const submitAnswer = (page: Page) =>
  page.getByRole('button', { name: 'Submit answer' })

async function start(page: Page, mode: string) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Play Roulette' }).click()
  await page.getByRole('button', { name: 'Start ' + mode }).click()
  await expect(page).toHaveURL(/\/play\/session\//)
}

async function spin(page: Page) {
  await page.getByRole('button', { name: 'Spin the wheel' }).click()
  return (await page.locator('.category-badge').innerText()).split(' · ')[0]
}

async function answer(page: Page, kind: string) {
  if (kind === 'WHO' || kind === 'WHAT')
    await page.locator('.options .option').first().click()
  if (kind === 'WHERE') {
    await page.getByLabel('Latitude', { exact: true }).fill('20')
    await page.getByLabel('Longitude', { exact: true }).fill('40')
  }
  if (kind === 'WHY') {
    const matches = page.locator('.match-grid select')
    if (await matches.count()) {
      for (let i = 0; i < (await matches.count()); i++)
        await matches.nth(i).selectOption({ index: i + 1 })
    } else {
      const evidence = page.locator('.question input[type=checkbox]')
      if (await evidence.count()) await evidence.first().check()
    }
  }
  await submitAnswer(page).click()
  await expect(page.locator('.feedback')).toBeVisible()
}

test('guest completes Quick Play and sees results and progress after a reload', async ({
  page,
}) => {
  await start(page, 'Quick Play')
  for (let i = 0; i < 5; i++) {
    await answer(page, await spin(page))
    if (i === 1) {
      await page.reload()
      await expect(page.locator('.feedback')).toBeVisible()
    }
    await page
      .getByRole('button', { name: i === 4 ? 'View results' : 'Next round' })
      .click()
  }
  await expect(
    page.getByRole('heading', { name: 'Session complete' }),
  ).toBeVisible()
  await expect(page.locator('.results-list details')).toHaveCount(5)
  await page.getByRole('link', { name: 'My progress' }).click()
  await expect(
    page.getByText('5 questions answered', { exact: false }),
  ).toBeVisible()
  await page.goto('/admin/questions')
  await expect(
    page.getByRole('heading', { name: 'Admin sign in' }),
  ).toBeVisible()
})

test('admin signs in, adds, edits, publishes and deletes a question', async ({
  page,
  request,
}) => {
  const legacy = await request.post('/api/auth/demo', {
    data: { role: 'admin' },
  })
  expect(legacy.status()).toBe(404)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(adminEmail)
  await page.getByLabel('Password', { exact: true }).fill(adminPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/questions/)
  const title = 'Test review ' + Date.now()
  const prompt = 'When did the event documented in ' + title + ' occur?'
  const updated = prompt.replace('occur', 'take place')
  await page.getByLabel('Topic title').fill(title)
  await page.getByLabel('Subject', { exact: true }).fill('History')
  await page.getByLabel('Question prompt').fill(prompt)
  await page.getByLabel('Correct answer label').fill('1900 CE')
  await page.getByLabel('Earliest accepted astronomical year').fill('1900')
  await page
    .getByLabel('Explanation', { exact: true })
    .fill('A test-only exercise for the moderation workflow.')
  await page.getByLabel('Source title').fill('Library of Congress')
  await page.getByLabel('Source URL').fill('https://loc.gov/')
  await page.getByRole('button', { name: 'Save for review' }).click()
  await expect(
    page.getByRole('heading', { name: 'Edit variant' }),
  ).toBeVisible()
  await page.getByLabel('Question prompt').fill(updated)
  await page.getByRole('button', { name: 'Save for review' }).click()
  await expect(
    page.getByRole('button', { name: updated, exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirm' })
    .click()
  await expect(
    page.locator('form').getByText('published', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Delete question' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click()
  await expect(
    page.locator('form').getByText('published', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Delete question' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Confirm' })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Question deleted.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: updated, exact: false }),
  ).toHaveCount(0)
})

test('mobile navigation and landing have no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Spin. Think. Discover.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page
    .getByRole('link', { name: 'Question bank', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Question bank' }),
  ).toBeVisible()
})

test('WHERE loads the bundled world map and accepts a pin and coordinates', async ({
  page,
}) => {
  const atlas = page.waitForResponse(
    (r) => r.url().endsWith('/maps/countries.geojson') && r.ok(),
  )
  const labels = page.waitForResponse(
    (r) => r.url().endsWith('/maps/labels.geojson') && r.ok(),
  )
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).origin === 'http://127.0.0.1:5178'
      ? route.continue()
      : route.abort(),
  )
  await start(page, 'Marathon')
  for (let round = 0; round < 20; round++) {
    const kind = await spin(page)
    if (kind === 'WHERE') {
      expect((await (await atlas).json()).features.length).toBeGreaterThan(150)
      expect((await (await labels).json()).features.length).toBeGreaterThan(300)
      const canvas = page.locator('.map canvas')
      await expect(canvas).toBeVisible()
      await canvas.click({ position: { x: 170, y: 160 } })
      await expect(page.getByLabel('Your guess')).toBeVisible()
      await expect(
        page.getByText('Part of the map could not load.', { exact: false }),
      ).toHaveCount(0)
      await answer(page, kind)
      await expect(page.locator('.feedback')).toContainText(
        'km from the target',
      )
      await expect(page.getByLabel('Correct location')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Natural Earth' })).toBeVisible()
      await expect(page.getByText('Map labels could not load.')).toHaveCount(0)
      return
    }
    await answer(page, kind)
    await page.getByRole('button', { name: 'Next round' }).click()
  }
  throw new Error('WHERE was absent from the Marathon pool.')
})
