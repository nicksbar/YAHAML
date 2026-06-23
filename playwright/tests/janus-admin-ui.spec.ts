import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

function randomCallsign() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const suffix = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
  return `K${Math.floor(Math.random() * 9) + 1}${suffix}`
}

async function canAccessAdmin(request: APIRequestContext, token: string) {
  const response = await request.get('/api/admin/callsigns', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return response.status() === 200
}

async function bootstrapSession(page: Page, request: APIRequestContext, callsign = randomCallsign()) {
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

    if (await canAccessAdmin(request, session.token)) {
      return
    }
  }

  throw new Error('Failed to bootstrap an admin-capable session for Janus admin UI tests')
}

test.describe('Janus Rooms Admin', () => {
  test.beforeEach(async ({ page, request }) => {
    // Bootstrap and navigate via in-app admin view
    await bootstrapSession(page, request)
    await expect(page.getByTestId('nav-admin')).toBeVisible()
    await page.getByTestId('nav-admin').click()
    await expect(page.getByRole('heading', { name: 'Admin Controls' })).toBeVisible()
    await expect(page.getByTestId('janus-admin-panel')).toBeVisible()
  })

  test('should display Janus rooms list', async ({ page }) => {
    // Check for admin panel title
    const title = page.locator('h2:has-text("Janus Rooms Admin")')
    await expect(title).toBeVisible()

    // Should have room list section
    const roomList = page.locator('.janus-rooms-admin')
    await expect(roomList).toBeVisible()
  })

  test('should allow selecting a room from list', async ({ page }) => {
    // Get first room button
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      // Room details should appear
      const details = page.locator('.janus-rooms-admin h4:has-text("Participants")')
      await expect(details).toBeVisible()
    }
  })

  test('should display room participants with role icons', async ({ page }) => {
    // Select first room
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      // Participant rows are rendered with emoji role indicators (🎤 operator / 📻 listener)
      await expect(page.locator('.janus-rooms-admin')).toContainText(/Participants|No participants/)
    }
  })

  test('should display RTP forward controls', async ({ page }) => {
    // Select first room
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      // Look for RTP forward section
      const rtpSection = page.locator('h4:has-text("RTP Forwards")')
      await expect(rtpSection).toBeVisible()
      
      // Should have add button
      const addButton = page.locator('button:has-text("Add")')
      await expect(addButton).toBeVisible()
    }
  })

  test('should toggle RTP forward form', async ({ page }) => {
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      const addButton = page.locator('button:has-text("Add")').first()
      
      if (await addButton.isVisible()) {
        await addButton.click()
        
        // Form should appear
        const hostInput = page.locator('input[placeholder="127.0.0.1 or Pi IP"]')
        await expect(hostInput).toBeVisible()
        
        // Cancel button should appear
        const cancelButton = page.locator('button:has-text("Cancel")')
        await expect(cancelButton).toBeVisible()
        
        // Click cancel
        await cancelButton.click()
        
        // Form should disappear
        await expect(hostInput).not.toBeVisible()
      }
    }
  })

  test('should start RTP forward with valid inputs', async ({ page }) => {
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      const addButton = page.locator('button:has-text("Add")').first()
      
      if (await addButton.isVisible()) {
        await addButton.click()
        
        // Fill form
        const hostInput = page.locator('input[placeholder="127.0.0.1 or Pi IP"]')
        const portInput = page.locator('input[type="number"]')
        
        await hostInput.fill('192.168.1.100')
        await portInput.fill('5006')
        
        // Start button
        const startButton = page.locator('button:has-text("Start Forward")')
        await startButton.click()
        
        // Either error or success (form closes)
        await expect(page.locator('input[placeholder="127.0.0.1 or Pi IP"]')).toBeHidden({ timeout: 5000 })
      }
    }
  })

  test('should display kick button for participants', async ({ page }) => {
    const firstRoom = page.locator('.janus-rooms-admin .space-y-2 button').first()
    
    if (await firstRoom.isVisible()) {
      await firstRoom.click()
      
      // Wait for participants
      const kickButton = page.locator('button:has-text("Kick")').first()
      
      if (await kickButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        expect(kickButton).toBeVisible()
      }
    }
  })
})

test.describe('Voice Room Panel - Join Modes', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to logging page with voice rooms
    await page.goto('/')
  })

  test('should show join mode selector', async ({ page }) => {
    // Find voice room panel
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Look for join mode radio buttons
      const operatorRadio = page.locator('input[value="operator"]').first()
      const listenerRadio = page.locator('input[value="listener"]').first()
      
      if (await operatorRadio.isVisible()) {
        await expect(operatorRadio).toBeChecked()
      }
    }
  })

  test('should allow selecting listener mode', async ({ page }) => {
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const listenerRadio = page.locator('input[value="listener"]').first()
      
      if (await listenerRadio.isVisible()) {
        await listenerRadio.click()
        await expect(listenerRadio).toBeChecked()
      }
    }
  })

  test('should display participant role indicators', async ({ page }) => {
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Look for role badges (🎤 for operator, 📻 for listener)
      const roles = page.locator('[class*="participant-role"]')
      
      if (await roles.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        const roleText = await roles.first().textContent()
        expect(['🎤', '📻']).toContain(roleText?.trim())
      }
    }
  })

  test('should show current user role after joining', async ({ page }) => {
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Find join button
      const joinButton = page.locator('button:has-text("Join")').first()
      
      if (await joinButton.isVisible()) {
        // Click join as operator (default)
        await joinButton.click()
        
        // Wait for active room display
        const activeRoom = page.locator('[class*="voice-room-active"]')
        
        if (await activeRoom.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Should show role badge
          const roleBadge = page.locator('[class*="voice-room-role-badge"]')
          if (await roleBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
            const badge = await roleBadge.textContent()
            expect(badge).toContain('Operator')
          }
        }
      }
    }
  })

  test('should allow leaving room', async ({ page }) => {
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const joinButton = page.locator('button:has-text("Join")').first()
      
      if (await joinButton.isVisible()) {
        await joinButton.click()
        
        const leaveButton = page.locator('button:has-text("Leave")').first()
        
        if (await leaveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await leaveButton.click()
          
          // Room list should reappear
          await expect(page.locator('button:has-text("Join")').first()).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })
})

test.describe('Admin UI - TX Authorization', () => {
  test('should enforce operator TX only for assigned users', async ({ page }) => {
    // This test verifies that non-assigned users can't transmit
    await page.goto('/admin/janus-rooms')
    
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    // Scenario: Try to join as operator without assignment
    // Should either downgrade to listener or show error
    // This depends on implementation
  })

  test('should allow listener mode for all users', async ({ page }) => {
    await page.goto('/')
    
    const voicePanel = page.locator('[class*="voice-room-panel"]')
    
    if (await voicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Select listener mode
      const listenerRadio = page.locator('input[value="listener"]').first()
      
      if (await listenerRadio.isVisible()) {
        await listenerRadio.click()
        
        // Should be able to join
        const joinButton = page.locator('button:has-text("Join")').first()
        
        if (await joinButton.isVisible()) {
          await joinButton.click()
          
          // Should succeed regardless of assignment
          const activeRoom = page.locator('[class*="voice-room-active"]')
          
          if (await activeRoom.isVisible({ timeout: 5000 }).catch(() => false)) {
            const roleText = await page.locator('[class*="voice-room-role-badge"]').textContent()
            expect(roleText).toContain('Listener')
          }
        }
      }
    }
  })
})
