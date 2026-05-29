import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

function randomCallsign() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const suffix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
  return `K${Math.floor(Math.random() * 9) + 1}${suffix}`
}

async function bootstrapAdminSession(page: Page, request: APIRequestContext, callsign = randomCallsign()) {
  let stationId = ''

  const createStationResponse = await request.post('/api/stations', {
    data: {
      callsign,
      name: callsign,
    },
  })

  if (createStationResponse.ok()) {
    const station = await createStationResponse.json()
    stationId = station.id
  } else if (createStationResponse.status() === 409) {
    const stationLookupResponse = await request.get(`/api/stations?callsign=${encodeURIComponent(callsign)}`)
    expect(stationLookupResponse.ok()).toBeTruthy()
    const stations = await stationLookupResponse.json()
    stationId = stations[0]?.id || ''
  }

  expect(stationId).toBeTruthy()

  const sessionResponse = await request.post('/api/sessions', {
    data: {
      callsign,
      stationId,
      browserId: `playwright-${callsign}`,
    },
  })

  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json()

  await page.goto('/')
  await page.evaluate(({ activeCallsign, token }) => {
    localStorage.setItem('yahaml:callsign', activeCallsign)
    localStorage.setItem('yahaml:sessionToken', token)
  }, { activeCallsign: callsign, token: session.token })
  await page.reload()

  await expect(page.getByTestId('callsign-toggle')).toContainText(callsign)
  await expect(page.getByTestId('nav-admin')).toBeVisible()

  return callsign
}

async function loadFieldDayScenario(page: Page) {
  const adminNav = page.getByTestId('nav-admin')
  await expect(adminNav).toBeVisible()
  await adminNav.click()

  await expect(page.getByRole('heading', { name: 'Admin Controls' })).toBeVisible()

  const scenarioPanel = page.getByTestId('scenario-loading-panel')
  await scenarioPanel.scrollIntoViewIfNeeded()
  await expect(scenarioPanel).toBeVisible()

  const scenarioCard = page.getByTestId('scenario-card-field-day-small')
  await expect(scenarioCard).toBeVisible()
  await scenarioCard.getByTestId('scenario-load-field-day-small').click()

  await expect(page.getByText('Confirm Scenario Load')).toBeVisible()
  await page.getByTestId('scenario-confirm-load').click()
  await expect(page.getByText(/Loaded:/)).toBeVisible({ timeout: 60_000 })
}

async function selectScenarioOperator(page: Page, request: APIRequestContext) {
  const stationsResponse = await request.get('/api/stations')
  expect(stationsResponse.ok()).toBeTruthy()
  const stations = await stationsResponse.json()
  const operator = stations[0]

  expect(operator?.id).toBeTruthy()
  expect(operator?.callsign).toBeTruthy()

  const sessionResponse = await request.post('/api/sessions', {
    data: {
      callsign: operator.callsign,
      stationId: operator.id,
      browserId: `playwright-${operator.callsign}`,
    },
  })

  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json()

  await page.evaluate(({ activeCallsign, token }) => {
    localStorage.setItem('yahaml:callsign', activeCallsign)
    localStorage.setItem('yahaml:sessionToken', token)
  }, { activeCallsign: operator.callsign, token: session.token })
  await page.reload()

  await expect(page.getByTestId('callsign-toggle')).toContainText(operator.callsign)

  return operator.callsign as string
}

async function bootstrapFieldDayScenario(page: Page, request: APIRequestContext) {
  await bootstrapAdminSession(page, request)
  await loadFieldDayScenario(page)
  return selectScenarioOperator(page, request)
}

test.describe('operator browser workflows', () => {
  test('loads a Field Day scenario and shows contest-specific logging fields', async ({ page, request }) => {
    const operatorCallsign = await bootstrapFieldDayScenario(page, request)

    await page.getByTestId('nav-logging').click()
    await expect(page.getByTestId('logging-page')).toBeVisible()
    await expect(page.getByTestId('logging-tab-standard')).toHaveClass(/active/)

    await expect(page.getByTestId('qso-entry-form')).toBeVisible()
    await expect(page.getByTestId('exchange-field-class')).toBeVisible()
    await expect(page.getByTestId('exchange-field-section')).toBeVisible()
    await expect(page.getByTestId('exchange-field-power')).toBeVisible()
    await expect(page.getByTestId('live-qso-feed')).toBeVisible()

    await expect(page.getByTestId('callsign-toggle')).toContainText(operatorCallsign)
  })

  test('logs, edits, and reflects a QSO across feed, stats, and recent contacts', async ({ page, request }) => {
    await bootstrapFieldDayScenario(page, request)

    await page.getByTestId('nav-logging').click()
    await expect(page.getByTestId('logging-page')).toBeVisible()

    await page.getByTestId('contact-callsign-input').fill('W1AW')
    await page.getByTestId('band-input').fill('20m')
    await page.getByTestId('mode-input').fill('CW')
    await page.getByTestId('rst-input').fill('599')
    await page.getByTestId('power-input').fill('100')
    await page.getByTestId('exchange-field-class').fill('2A')
    await page.getByTestId('exchange-field-section').fill('EMA')
    await page.getByTestId('exchange-field-power').fill('LOW')
    await page.getByTestId('notes-input').fill('Playwright browser regression')
    await expect(page.getByTestId('submit-qso-button')).toBeEnabled()
    await page.getByTestId('submit-qso-button').click()

    await expect(page.getByText(/QSO logged successfully!/)).toBeVisible()

    const w1awFeedEntry = page.getByTestId('qso-feed-entry').filter({ hasText: 'W1AW' }).first()
    await expect(w1awFeedEntry).toContainText('W1AW')
    await expect(w1awFeedEntry).toContainText('class:2A')
    await expect(w1awFeedEntry).toContainText('section:EMA')
    await expect(w1awFeedEntry).toContainText('power:LOW')

    await w1awFeedEntry.getByTestId('qso-edit-button').click()
    await w1awFeedEntry.getByPlaceholder('Contest: section').fill('ENY')
    await w1awFeedEntry.getByTestId('qso-edit-notes').fill('Edited by Playwright')
    await w1awFeedEntry.getByTestId('qso-save-button').click()

    await expect(w1awFeedEntry).toContainText('section:ENY')
    await expect(w1awFeedEntry).toContainText('Edited by Playwright')

    await page.getByTestId('nav-dashboard').click()
    await expect(page.getByTestId('dashboard-view')).toBeVisible()

    await expect
      .poll(async () => Number((await page.getByTestId('stats-qso-count').textContent()) || '0'))
      .toBeGreaterThan(0)
    await expect
      .poll(async () => Number((await page.getByTestId('stats-points-total').textContent()) || '0'))
      .toBeGreaterThan(0)

    await expect(page.getByTestId('recent-contacts-list')).toContainText('W1AW')
  })
})
