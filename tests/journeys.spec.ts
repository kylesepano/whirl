import { expect, test, type Page } from '@playwright/test'

const adminEmail = 'admin@whirl.example'
const adminPassword = 'playwright-local-admin'
const submitAnswer = (page: Page) =>
  page.getByRole('button', { name: 'Submit answer' })

async function start(page: Page, mode: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start ' + mode }).click()
  await expect(page).toHaveURL(/\/play\/session\//)
}

async function spin(page: Page) {
  await page.getByRole('button', { name: 'Spin the wheel' }).click()
  return (await page.locator('.category-badge').innerText()).split(' · ')[0]
}

async function answer(page: Page, kind: string) {
  if (kind === 'WHO' || kind === 'WHAT') {
    const choice = page.locator('.options .option').first()
    if (await choice.count()) await choice.click()
    else
      await page
        .getByLabel('Your answer', { exact: true })
        .fill('Example guess')
  }
  if (kind === 'WHERE') {
    if (await page.getByText('Select a country on the map or from the list below.').count()) {
      await page.getByLabel('Country guess').selectOption('RUS')
    } else {
      await page.getByLabel('Latitude', { exact: true }).fill('20')
      await page.getByLabel('Longitude', { exact: true }).fill('40')
    }
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

test('the animated wheel stops at the server category before opening the question', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await start(page, 'Quick Play')
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/play/spin') && r.ok(),
  )
  await page.getByRole('button', { name: 'Spin the wheel' }).click()
  const { kind } = await (await response).json()
  await expect(
    page.getByRole('status').filter({ hasText: 'Spinning…' }),
  ).toBeVisible()
  const landing = await page.waitForFunction((picked) => {
    const label = document.querySelector(
      '.wheel-label[data-category="' + picked + '"]',
    )
    const slice = document.querySelector(
      '.slice-selected[data-category="' + picked + '"]',
    )
    const pointer = document.querySelector('.wheel-pointer')
    const hub = document.querySelector('.wheel-hub')
    if (!label || !slice || !pointer || !hub) return
    const box = label.getBoundingClientRect()
    const marker = pointer.getBoundingClientRect()
    return {
      difference: Math.abs(
        box.left + box.width / 2 - marker.left - marker.width / 2,
      ),
      aboveHub: box.bottom < hub.getBoundingClientRect().top,
      upright:
        label.querySelector('svg')!.getBoundingClientRect().top <
        label.querySelector('span')!.getBoundingClientRect().top,
      status: document.querySelector('.game-stage [role="status"]')
        ?.textContent,
    }
  }, kind)
  expect(await landing.jsonValue()).toMatchObject({
    aboveHub: true,
    upright: true,
    status: kind.toUpperCase() + ' selected',
  })
  expect((await landing.jsonValue()).difference).toBeLessThan(2)
  await expect(page.locator('.category-badge')).toContainText(
    kind.toUpperCase(),
  )
})

test('guest completes Quick Play and sees session results after a reload', async ({
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
  await page.getByRole('link', { name: 'Play again' }).click()
  await expect(page.getByRole('button', { name: 'Start Quick Play' })).toBeVisible()
  await expect(page.getByText('My progress')).toHaveCount(0)
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
  await expect(page.getByRole('heading', { name: 'Question bank' })).toBeVisible()
  const search = page.getByLabel('Search questions')
  await search.fill('wild giant pandas')
  await expect(page.getByRole('button', { name: /Which country is home to wild giant pandas/ })).toBeVisible()
  await search.clear()
  await page.getByRole('button', { name: 'New question' }).click()
  const title = 'Test review ' + Date.now()
  const prompt = 'Which country is the setting of ' + title + '?'
  const updated = prompt.replace('the setting of', 'featured in')
  await page.getByLabel('Topic title').fill(title)
  await page.getByLabel('Subject', { exact: true }).fill('History')
  await page.getByLabel('Question prompt').fill(prompt)
  await page.getByLabel('Question type').selectOption('where')
  await page.getByLabel('Map answer type').selectOption('country')
  await page.getByLabel('Correct country').selectOption('CHN')
  await page
    .getByLabel('Explanation', { exact: true })
    .fill('A test-only exercise for the moderation workflow.')
  await page.getByLabel('Source title').fill('Library of Congress')
  await page.getByLabel('Source URL').fill('https://loc.gov/')
  await page.getByRole('button', { name: 'Save for review' }).click()
  await expect(
    page.getByRole('heading', { name: 'Edit variant' }),
  ).toBeVisible()
  await expect(page.getByLabel('Map answer type')).toHaveValue('country')
  await expect(page.getByLabel('Correct country')).toHaveValue('CHN')
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

test('mobile opens directly to Play without public admin or player tracking links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Play WHIRL' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Quick Play' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.locator('a[href="/login"], a[href="/question-bank"], a[href="/leaderboard"]')).toHaveCount(0)
  for (const path of ['/progress', '/achievements', '/leaderboard']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Play WHIRL' })).toBeVisible()
  }
  await page.goto('/question-bank')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
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
  // The larger WHERE pool includes both country guesses and location pins.
  // Use a fixed point question to keep this map interaction test deterministic.
  await page.route('**/api/play/spin', (route) => route.fulfill({
    json: {
      id: '3182da6f-cd9d-43de-a983-6ae1b069e6ae',
      kind: 'where',
      position: 1,
      topic: 'History',
      prompt: 'Pin the pyramid complex that includes the Great Pyramid of Khufu.',
      difficulty: 'standard',
      deadline: null,
      reveals: 0,
      display: {},
    },
  }))
  await page.route('**/api/play/submit', (route) => {
    const { answer } = route.request().postDataJSON()
    expect(answer).toEqual({ lat: 20, lng: 40 })
    return route.fulfill({
      json: {
        answer,
        score: 0,
        difference: 1450,
        solution: { label: 'Giza pyramid complex', lat: 29.9792, lng: 31.1342 },
        explanation: 'The Great Pyramid of Khufu is at Giza.',
        sourceUrl: 'https://whc.unesco.org/en/list/86/',
        sourceTitle: 'UNESCO World Heritage Centre',
      },
    })
  })
  await start(page, 'Practice')
  expect(await spin(page)).toBe('WHERE')
  expect((await (await atlas).json()).features.length).toBeGreaterThan(150)
  expect((await (await labels).json()).features.length).toBeGreaterThan(300)
  const canvas = page.locator('.map canvas')
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 170, y: 160 } })
  await expect(page.getByLabel('Your guess')).toBeVisible()
  await expect(
    page.getByText('Part of the map could not load.', { exact: false }),
  ).toHaveCount(0)
  await answer(page, 'WHERE')
  await expect(page.locator('.feedback')).toContainText('km from the target')
  await expect(page.getByLabel('Correct location')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Natural Earth', exact: true })).toBeVisible()
  await expect(page.getByText('Map labels could not load.')).toHaveCount(0)
})

test('WHERE country mode highlights distant parts of the picked country and reveals the correct country', async ({
  page,
}) => {
  const roundId = '3c38f1d0-a451-42c2-a792-8ec0147f05f3'
  await page.route('**/api/play/spin', (route) => route.fulfill({
    json: {
      id: roundId,
      kind: 'where',
      position: 1,
      topic: 'Animals',
      prompt: 'Which country is home to wild giant pandas?',
      difficulty: 'standard',
      deadline: null,
      reveals: 0,
      display: { mechanic: 'country' },
    },
  }))
  await page.route('**/api/play/submit', (route) => {
    const { answer } = route.request().postDataJSON()
    expect(answer).toEqual({ country: 'RUS' })
    return route.fulfill({
      json: {
        answer,
        score: 0,
        solution: { label: 'China', country: 'CHN' },
        explanation: 'Wild giant pandas live in central China.',
        sourceUrl: 'https://nationalzoo.si.edu/animals/giant-panda',
        sourceTitle: 'Smithsonian National Zoo: Giant panda',
      },
    })
  })
  await start(page, 'Practice')
  await spin(page)
  await expect(submitAnswer(page)).toBeDisabled()
  const canvas = page.getByLabel('Interactive country map').locator('canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  // Match the initial Mercator camera at [0, 21] and zoom 0.6.
  const worldSize = 512 * 2 ** 0.6
  const mercator = (lat: number) => Math.asinh(Math.tan(lat * Math.PI / 180)) / (2 * Math.PI)
  const project = (lng: number, lat: number) => ({
    x: Math.round(box.width / 2 + worldSize * lng / 360),
    y: Math.round(box.height / 2 - worldSize * (mercator(lat) - mercator(21))),
  })
  const westernRussia = project(55, 57)
  const easternRussia = project(130, 64)
  await expect(async () => {
    await canvas.click({ position: westernRussia })
    await expect(page.getByLabel('Country guess')).toHaveValue('RUS', { timeout: 500 })
  }).toPass({ timeout: 10000 })
  await expect(async () => {
    const data = (await canvas.screenshot({ scale: 'css' })).toString('base64')
    const colors = await page.evaluate(async ({ data, points }) => {
      const rendered = new Image()
      rendered.src = 'data:image/png;base64,' + data
      await rendered.decode()
      const canvas = document.createElement('canvas')
      canvas.width = rendered.width
      canvas.height = rendered.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(rendered, 0, 0)
      return points.map(({ x, y }) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3))
    }, { data, points: [westernRussia, easternRussia] })
    expect(colors).toEqual([[153, 118, 223], [153, 118, 223]])
  }).toPass({ timeout: 5000 })
  await submitAnswer(page).click()
  await expect(page.getByText('Your guess · Russia')).toBeVisible()
  await expect(page.getByText('Correct country · China')).toBeVisible()
  await expect(page.getByLabel('Country guess')).toHaveCount(0)
})
