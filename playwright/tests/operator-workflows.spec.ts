import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

function randomCallsign() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const suffix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
  return `K${Math.floor(Math.random() * 9) + 1}${suffix}`
}

async function getStoredSessionToken(page: Page) {
  return page.evaluate(() => localStorage.getItem('yahaml:sessionToken'))
}

async function canAccessAdmin(request: APIRequestContext, token: string) {
  const response = await request.get('/api/admin/callsigns', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return response.status() === 200
}

async function openLoggingPage(page: Page) {
  await page.getByTestId('nav-logging').click()
  await expect(page.getByTestId('logging-page')).toBeVisible()
  await expect(page.getByTestId('logging-tab-standard')).toHaveClass(/active/)
}

async function waitForAdminReady(page: Page, request: APIRequestContext) {
  await expect
    .poll(async () => {
      const token = await getStoredSessionToken(page)
      if (!token) return 0

      const response = await request.get('/api/admin/callsigns', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      return response.status()
    })
    .toBe(200)

  await page.reload()
  await expect(page.getByTestId('nav-admin')).toBeVisible()
}

async function bootstrapAdminSession(page: Page, request: APIRequestContext, callsign = randomCallsign()) {
  const preferredCandidates = [callsign, 'W5XYZ', 'W5ABC']
  const candidateCallsigns = Array.from(new Set(preferredCandidates.map((c) => c.trim().toUpperCase()).filter(Boolean)))

  for (const candidateCallsign of candidateCallsigns) {
    let stationId = ''

    const createStationResponse = await request.post('/api/stations', {
      data: {
        callsign: candidateCallsign,
        name: candidateCallsign,
      },
    })

    if (createStationResponse.ok()) {
      const station = await createStationResponse.json()
      stationId = station.id
    } else if (createStationResponse.status() === 409) {
      const stationLookupResponse = await request.get('/api/stations')
      expect(stationLookupResponse.ok()).toBeTruthy()
      const stations = await stationLookupResponse.json()
      const matchedStation = stations.find((station: { callsign?: string; id?: string }) => {
        return String(station.callsign || '').toUpperCase() === candidateCallsign
      })
      stationId = matchedStation?.id || ''
    }

    expect(stationId).toBeTruthy()

    const sessionResponse = await request.post('/api/sessions', {
      data: {
        callsign: candidateCallsign,
        stationId,
        browserId: `playwright-${candidateCallsign}`,
      },
    })

    expect(sessionResponse.ok()).toBeTruthy()
    const session = await sessionResponse.json()

    await page.goto('/')
    await page.evaluate(({ activeCallsign, token }) => {
      localStorage.setItem('yahaml:callsign', activeCallsign)
      localStorage.setItem('yahaml:sessionToken', token)
    }, { activeCallsign: candidateCallsign, token: session.token })
    await page.reload()

    await expect(page.getByTestId('callsign-toggle')).toContainText(candidateCallsign)

    if (await canAccessAdmin(request, session.token)) {
      return candidateCallsign
    }
  }

  throw new Error('Failed to bootstrap an admin-capable session for Playwright tests')
}

async function loadScenario(page: Page, request: APIRequestContext, scenarioId: string) {
  await waitForAdminReady(page, request)

  const adminNav = page.getByTestId('nav-admin')
  await expect(adminNav).toBeVisible()
  await adminNav.click()

  await expect(page.getByRole('heading', { name: 'Admin Controls' })).toBeVisible()

  const scenarioPanel = page.getByTestId('scenario-loading-panel')
  await scenarioPanel.scrollIntoViewIfNeeded()
  await expect(scenarioPanel).toBeVisible()

  const scenarioCard = page.getByTestId(`scenario-card-${scenarioId}`)
  const cardVisible = await scenarioCard.isVisible({ timeout: 8000 }).catch(() => false)

  if (cardVisible) {
    await scenarioCard.getByTestId(`scenario-load-${scenarioId}`).click()
    await expect(page.getByText('Confirm Scenario Load')).toBeVisible()
    await page.getByTestId('scenario-confirm-load').click()
    await expect(page.getByText(/Loaded:/)).toBeVisible({ timeout: 60_000 })
    return
  }

  // Fallback path: if scenario cards haven't populated yet in slower compose startup,
  // invoke the same admin endpoint directly using the browser session token.
  const token = await getStoredSessionToken(page)
  expect(token).toBeTruthy()

  const loadResponse = await request.post(`/api/admin/scenarios/${scenarioId}/load`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  expect(loadResponse.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('nav-admin')).toBeVisible()
}

async function selectScenarioOperatorViaPicker(page: Page, callsign = 'W5ABC') {
  await page.getByTestId('callsign-toggle').click()

  const callsignOption = page.getByTestId(`callsign-option-${callsign}`)
  await expect(callsignOption).toBeVisible({ timeout: 20_000 })
  await callsignOption.click()

  await expect(page.getByTestId('callsign-toggle')).toContainText(callsign)
}

async function selectScenarioOperator(page: Page, request: APIRequestContext) {
  return selectScenarioOperatorByCallsign(page, request)
}

async function selectScenarioOperatorByCallsign(page: Page, request: APIRequestContext, callsign?: string) {
  const stationsResponse = await request.get('/api/stations')
  expect(stationsResponse.ok()).toBeTruthy()
  const stations = await stationsResponse.json()
  const operator = callsign
    ? stations.find((station: { callsign: string }) => station.callsign === callsign)
    : stations[0]

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
  await loadScenario(page, request, 'field-day-small')
  return selectScenarioOperator(page, request)
}

async function bootstrapScenario(page: Page, request: APIRequestContext, scenarioId: string, callsign?: string) {
  await bootstrapAdminSession(page, request)
  await loadScenario(page, request, scenarioId)
  return selectScenarioOperatorByCallsign(page, request, callsign)
}

async function deactivateActiveContest(page: Page, request: APIRequestContext) {
  const token = await getStoredSessionToken(page)
  expect(token).toBeTruthy()

  const response = await request.post('/api/admin/deactivate-contest', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  expect(response.ok()).toBeTruthy()
  await page.reload()
}

test.describe('operator browser workflows', () => {
  test('reaches logging without club or contest and hides contest-specific options', async ({ page, request }) => {
    const operatorCallsign = await bootstrapAdminSession(page, request)
    await deactivateActiveContest(page, request)

    await openLoggingPage(page)

    await expect(page.getByTestId('qso-entry-form')).toBeVisible()
    await expect(page.getByTestId('live-qso-feed')).toBeVisible()
    await expect(page.getByTestId('logging-tab-gota')).toHaveCount(0)
    await expect(page.getByTestId('exchange-field-class')).toHaveCount(0)
    await expect(page.getByTestId('exchange-field-section')).toHaveCount(0)
    await expect(page.getByTestId('exchange-field-power')).toHaveCount(0)
    await expect(page.getByTestId('callsign-toggle')).toContainText(operatorCallsign)
  })

  test('reaches logging with contest but without club and keeps gota hidden', async ({ page, request }) => {
    const operatorCallsign = await bootstrapScenario(page, request, 'home-1-station', 'W5XYZ')

    await openLoggingPage(page)

    await expect(page.getByTestId('qso-entry-form')).toBeVisible()
    await expect(page.getByTestId('live-qso-feed')).toBeVisible()
    await expect(page.getByTestId('logging-tab-gota')).toHaveCount(0)
    await expect(page.getByTestId('callsign-toggle')).toContainText(operatorCallsign)
  })

  test('switches to a scenario operator through the callsign picker', async ({ page, request }) => {
    await bootstrapAdminSession(page, request)
    const bootstrapToken = await getStoredSessionToken(page)

    expect(bootstrapToken).toBeTruthy()

    await loadScenario(page, request, 'field-day-small')
    await selectScenarioOperatorViaPicker(page, 'W5ABC')

    await expect
      .poll(async () => {
        const token = await getStoredSessionToken(page)
        if (!token || token === bootstrapToken) return 0

        const response = await request.get('/api/sessions/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        return response.status()
      })
      .toBe(200)

    await expect(page.getByTestId('nav-admin')).toBeVisible()
    await page.getByTestId('nav-logging').click()
    await expect(page.getByTestId('logging-page')).toBeVisible()
    await expect(page.getByTestId('callsign-toggle')).toContainText('W5ABC')
  })

  test('loads a Field Day scenario and shows contest-specific logging fields', async ({ page, request }) => {
    const operatorCallsign = await bootstrapFieldDayScenario(page, request)

    await openLoggingPage(page)

    await expect(page.getByTestId('qso-entry-form')).toBeVisible()
    await expect(page.getByTestId('logging-tab-gota')).toBeVisible()
    await expect(page.getByTestId('exchange-field-class')).toBeVisible()
    await expect(page.getByTestId('exchange-field-section')).toBeVisible()
    await expect(page.getByTestId('exchange-field-power')).toBeVisible()
    await expect(page.getByTestId('live-qso-feed')).toBeVisible()

    await expect(page.getByTestId('callsign-toggle')).toContainText(operatorCallsign)
  })

  test('logs, edits, and reflects a QSO across feed, stats, and recent contacts', async ({ page, request }) => {
    await bootstrapFieldDayScenario(page, request)

    await openLoggingPage(page)

    await page.getByTestId('contact-callsign-input').fill('W1AW')
    const qsoForm = page.getByTestId('qso-entry-form')
    const preferredBandButton = qsoForm.getByTestId('band-quick-20m')
    if (await preferredBandButton.count()) {
      await preferredBandButton.click()
    } else {
      await qsoForm.locator('[data-testid^="band-quick-"]').first().click()
    }

    const preferredModeButton = qsoForm.getByTestId('mode-quick-cw')
    if (await preferredModeButton.count()) {
      await preferredModeButton.click()
    } else {
      await qsoForm.locator('[data-testid^="mode-quick-"]').first().click()
    }
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

  test('enables HAM console theme mode', async ({ page, request }) => {
    await bootstrapFieldDayScenario(page, request)

    const hamToggle = page.getByRole('button', { name: '📻' })
    await expect(hamToggle).toBeVisible()
    await hamToggle.click()

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains('theme-ham')))
      .toBeTruthy()
  })

  test('supports bulk updates from log management panel', async ({ page, request }) => {
    await bootstrapFieldDayScenario(page, request)

    await openLoggingPage(page)

    const qsoForm = page.getByTestId('qso-entry-form')
    await page.getByTestId('contact-callsign-input').fill('K1MGT')

    const preferredBandButton = qsoForm.getByTestId('band-quick-20m')
    if (await preferredBandButton.count()) {
      await preferredBandButton.click()
    } else {
      await qsoForm.locator('[data-testid^="band-quick-"]').first().click()
    }

    const preferredModeButton = qsoForm.getByTestId('mode-quick-cw')
    if (await preferredModeButton.count()) {
      await preferredModeButton.click()
    } else {
      await qsoForm.locator('[data-testid^="mode-quick-"]').first().click()
    }

    await page.getByTestId('rst-input').fill('599')
    await page.getByTestId('exchange-field-class').fill('2A')
    await page.getByTestId('exchange-field-section').fill('EMA')
    await page.getByTestId('exchange-field-power').fill('LOW')
    await page.getByTestId('submit-qso-button').click()
    await expect(page.getByText(/QSO logged successfully!/)).toBeVisible()

    await page.reload()
    await openLoggingPage(page)

    await page.getByTestId('log-mgmt-filter-callsign').fill('K1MGT')
    const managedRow = page.locator('.log-mgmt-table tbody tr').filter({ hasText: 'K1MGT' }).first()
    await expect(managedRow).toBeVisible()
    await managedRow.locator('input[type="checkbox"]').click()
    await expect(page.getByTestId('log-mgmt-selected-count')).toContainText('Selected: 1')

    await page.getByTestId('log-mgmt-bulk-mode').fill('RTTY')
    await page.getByTestId('log-mgmt-apply').click()
    await expect(page.getByTestId('log-mgmt-status')).toContainText('Bulk update complete')

    const updatedEntry = page.getByTestId('qso-feed-entry').filter({ hasText: 'K1MGT' }).first()
    await expect(updatedEntry).toContainText('RTTY')
    await expect(page.getByTestId('log-mgmt-export-adif')).toBeVisible()
  })
})
